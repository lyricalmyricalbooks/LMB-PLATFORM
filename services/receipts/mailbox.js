// Reading the receipts that shops forward to Colophon's own Google mailbox (receipts by email, 12 November 2026).
//
// Every shop's receipts address is a plus-address of one mailbox (receipts+<shop>.<letters>@<platform domain>), so no
// mailbox is made per shop. The server signs in as the mailbox the same way the sender does (services/email/gmail.js
// `delegatedMailToken`), with the permission to read and bin its mail (gmail.modify). That permission is on Colophon's
// own mailbox only: nobody's personal Gmail is ever read.
//
//   GET  gmail/v1/users/me/messages?q=...                      -> { messages: [{ id }] }
//   GET  gmail/v1/users/me/messages/{id}?format=full           -> headers, parts, internalDate
//   GET  gmail/v1/users/me/messages/{id}/attachments/{attId}   -> { data (base64url), size }
//   POST gmail/v1/users/me/messages/{id}/trash                 -> binned (Google deletes it for good after 30 days)
//
// The search only narrows; `addressedTo` (the message's own headers) is the wall the caller checks before any message
// is handed to a shop.
import { delegatedMailToken, googleRefused, jsonOf } from "../email/gmail.js";

export const GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
/** Receipt files a shop can keep (apps/shop receiptUpload.ts): photos and PDFs. */
export const FILE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
export const FILE_MAX_BYTES = 5 * 1024 * 1024;
export const TEXT_MAX = 12_000;
const ADDRESS_HEADERS = new Set(["to", "cc", "delivered-to", "x-forwarded-to", "x-original-to", "envelope-to", "x-delivered-to", "received"]);
const ADDRESS = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

const fromB64url = (data) => Buffer.from(String(data ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** A web email's words: tags, styles and scripts gone, one line per block. Pure. */
export function plainFromHtml(html) {
  return String(html ?? "")
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * One Gmail message (format=full) as what a receipt needs: who sent it, its subject and day, its words and its
 * photo or PDF files. `addressedTo` is every address the message's own headers say it was sent or forwarded to. Pure.
 */
export function parseMessage(message) {
  const headers = message?.payload?.headers ?? [];
  const first = (name) => String(headers.find((h) => String(h.name).toLowerCase() === name)?.value ?? "").replace(/\s+/g, " ").trim();
  const addressedTo = new Set();
  for (const h of headers) {
    if (!ADDRESS_HEADERS.has(String(h.name).toLowerCase())) continue;
    for (const found of String(h.value ?? "").match(ADDRESS) ?? []) addressedTo.add(found.toLowerCase());
  }
  let plain = "", html = "";
  const files = [];
  const walk = (part) => {
    if (!part) return;
    const type = String(part.mimeType ?? "").toLowerCase();
    const name = String(part.filename ?? "");
    if (name || part.body?.attachmentId) {
      if (FILE_TYPES.has(type)) files.push({ attachmentId: part.body?.attachmentId ?? "", data: part.body?.data ?? "", name: name || "receipt", type, size: Number(part.body?.size) || 0 });
    } else if (type === "text/plain" && part.body?.data) plain += `${fromB64url(part.body.data).toString("utf8")}\n`;
    else if (type === "text/html" && part.body?.data) html += fromB64url(part.body.data).toString("utf8");
    for (const child of part.parts ?? []) walk(child);
  };
  walk(message?.payload);
  const text = (plain.trim() || plainFromHtml(html)).slice(0, TEXT_MAX);
  const at = Number(message?.internalDate);
  return {
    id: String(message?.id ?? ""), from: first("from").slice(0, 200), subject: first("subject").slice(0, 200),
    receivedAt: Number.isFinite(at) && at > 0 ? new Date(at).toISOString() : "", text, files, addressedTo: [...addressedTo],
  };
}

/**
 * Gmail's "confirm this forwarding address" email, sent when a person sets their Gmail to forward automatically:
 * the code they type into Gmail and who asked, or null. Pure.
 */
export function forwardingConfirmation({ from, subject, text }) {
  if (!/forwarding-noreply@google\.com/i.test(from ?? "")) return null;
  const code = /\(#\s*(\d{6,12})\)/.exec(subject ?? "")?.[1] ?? /confirmation code:?\s*(\d{6,12})/i.exec(text ?? "")?.[1] ?? "";
  if (!code) return null;
  const asker = /from\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\s*$/i.exec(subject ?? "")?.[1] ?? "";
  return { code, from: asker.toLowerCase() };
}

/** The reader. `token()` is the server's own Google token; `account` may act as `mailbox` (domain-wide delegation). */
export function receiptMailbox({ fetch, token, account, mailbox, now = () => Date.now() }) {
  const mailToken = delegatedMailToken({ fetch, token, account, mailbox, scope: GMAIL_MODIFY_SCOPE, now });
  async function call(what, url, init = {}) {
    const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await mailToken()}`, ...(init.headers ?? {}) } });
    const answer = await jsonOf(response);
    if (response.status === 401) mailToken.forget();
    if (!response.ok) throw googleRefused(what, response.status, answer);
    return answer;
  }
  return {
    /** Ids of the messages Gmail finds for `address`, in the inbox and in spam (a forwarded receipt often lands there). */
    async find(address, max = 20) {
      const q = `{deliveredto:${address} to:${address} cc:${address}}`;
      const inbox = await call("to list the receipts", `${BASE}?${new URLSearchParams({ q, maxResults: String(max) })}`);
      const spam = await call("to list the receipts", `${BASE}?${new URLSearchParams({ q, maxResults: String(max), labelIds: "SPAM", includeSpamTrash: "true" })}`);
      return [...new Set([...(inbox.messages ?? []), ...(spam.messages ?? [])].map((m) => String(m.id)))].slice(0, max);
    },
    /** One message, parsed. */
    async read(id) {
      return parseMessage(await call("to open a receipt", `${BASE}/${encodeURIComponent(id)}?format=full`));
    },
    /** A file of a parsed message as base64 (not base64url), or null when it is over the size a shop keeps. */
    async file(id, file) {
      if (!file || file.size > FILE_MAX_BYTES) return null;
      const data = file.data || (await call("to open a receipt's file", `${BASE}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file.attachmentId)}`)).data;
      const bytes = fromB64url(data);
      if (!bytes.length || bytes.length > FILE_MAX_BYTES) return null;
      return { name: file.name, type: file.type, data: bytes.toString("base64") };
    },
    /** Bins one message. A message already gone counts as done. */
    async bin(id) {
      try { await call("to bin a receipt", `${BASE}/${encodeURIComponent(id)}/trash`, { method: "POST" }); }
      catch (error) { if (error.status !== 404) throw error; }
    },
  };
}
