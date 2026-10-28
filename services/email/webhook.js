// The door Resend's delivery events come in by (code plan 8.3): one HTTP handler, hosted later as one function in the
// platform project next to the shop door (http.js). It takes a plain { method, headers, rawBody } and returns
// { status, body }, so tests need no server.
//
// Resend signs each event the Svix way (docs: resend.com/docs/webhooks/verify-webhooks-requests,
// docs.svix.com/receiving/verifying-payloads/how-manual): the signed text is `<svix-id>.<svix-timestamp>.<raw body>`,
// the key is the base64 part of the signing secret after `whsec_`, the signature is HMAC-SHA256 in base64, and the
// `svix-signature` header lists one or more `v1,<signature>` separated by spaces. Anything unsigned, signed with another
// key or older than five minutes is refused, so nobody can pause a shop's newsletter with a made-up complaint.
//
// The secret is RESEND_WEBHOOK_SECRET in this service's environment, like the sending key.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCE_SECONDS = 5 * 60;

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

/** The signature Resend would send for this id, time and body (tests use it to sign fake events). */
export function signEvent({ secret, id, timestamp, body }) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

/** True when one of the header's signatures matches and the time is within five minutes of now. */
export function verifyEvent({ secret, headers, rawBody, now = () => new Date() }) {
  if (typeof secret !== "string" || !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(secret)) return false;
  const id = header(headers, "svix-id");
  const timestamp = header(headers, "svix-timestamp");
  const signatures = header(headers, "svix-signature").split(" ").filter((s) => s.startsWith("v1,"));
  if (!id || !/^\d{1,12}$/.test(timestamp) || !signatures.length || typeof rawBody !== "string") return false;
  if (Math.abs(now().getTime() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signEvent({ secret, id, timestamp, body: rawBody }));
  return signatures.some((s) => {
    const given = Buffer.from(s);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Handles one delivery event: checks the signature, then lets the reputation guard count it. */
export async function handleResendEvent(request, { secret, guard, now = () => new Date() }) {
  if (request?.method !== "POST") return { status: 405, body: { ok: false } };
  if (!verifyEvent({ secret, headers: request.headers, rawBody: request.rawBody, now })) return { status: 401, body: { ok: false } };
  let event;
  try {
    event = JSON.parse(request.rawBody);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  // Svix sends the same event again until it gets a 2xx; the event id makes a repeat count once.
  const result = await guard.record(event, { eventId: header(request.headers, "svix-id") });
  return { status: 200, body: { ok: true, ...result } };
}
