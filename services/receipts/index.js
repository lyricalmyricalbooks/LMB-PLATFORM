// Receipts by email (beta, 12 November 2026). A shop owner forwards receipts to the shop's own address; they wait in
// the shop admin (Bookkeeping › Receipts) until the owner checks each one and adds it as an expense.
//
// The platform's part is small: it gives each shop its address and hands that shop the mail sent to it. The shop's own
// server (apps/shop/functions/receiptInbox.js) asks through the shop door below, reads each email, and keeps what is
// waiting in the shop's own folder. Nothing is kept here but the address, on the shop's registry row:
//
//   receiptMail: { code, on, startedAt, stoppedAt?, day, handed }
//
// The address is `receipts+<shopId>.<code>@<platform domain>`: a plus-address of Colophon's own mailbox, so there is
// no mailbox per shop. `code` is 8 random letters, so the address can't be guessed from the shop's name; "new address"
// makes another and the old one stops at once.
//
// The wall between shops: a message is handed to a shop only when the message's own headers name that shop's current
// address (`mine`), whatever the mailbox's search returned. `file` and `done` check the same before touching one.
//
// Off until RECEIPT_MAIL=on (Julian's steps: server/README.md, "Receipts by email").
//
// The shop door: POST /api/receipts/shop, `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }.
//
//   receipts.status                    { available, on, address }
//   receipts.start    { by }           { available, on: true, address }     makes the address the first time
//   receipts.stop     { by }           { available, on: false, address }    the address is kept for a later start
//   receipts.newAddress { by }         { available, on, address }           the old address stops
//   receipts.pull     { have: [id] }   { emails: [{ id, from, subject, receivedAt, text, file?, confirm? }], more }
//   receipts.file     { id }           { file: { name, type, data } | null }
//   receipts.done     { ids: [id] }    { done: n }                          each message is binned
import { randomInt } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { mailAccount } from "../email/index.js";
import { metadataToken } from "../../server/metadata.js";
import { platformSettings } from "../settings.js";
import { SignupError } from "../../signup/signup.js";
import { forwardingConfirmation, receiptMailbox } from "./mailbox.js";

/** Letters and digits that can't be mistaken for each other when read aloud or typed. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE = /^[a-z2-9]{8}$/;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
/** Emails handed over in one call (each may carry a file), and a shop's most in one day. */
export const PULL_BATCH = 3;
export const DAILY_LIMIT = 150;

/** The Launch page's line (control-room/platformControls.js): a setting, not a secret. */
export const RECEIPT_MAIL_SETTING = Object.freeze({ env: "RECEIPT_MAIL", value: "on" });
export const hasReceiptMail = (env = {}) => String(env.RECEIPT_MAIL ?? "").trim().toLowerCase() === "on" && Boolean(mailAccount(env));
export const newCode = (random = randomInt) => Array.from({ length: 8 }, () => ALPHABET[random(ALPHABET.length)]).join("");

/** A shop's receipts address, or "" before it has one. Pure. */
export function receiptAddress(base, shopId, code) {
  const [name, domain] = String(base ?? "").toLowerCase().split("@");
  return name && domain && CODE.test(code ?? "") ? `${name}+${shopId}.${code}@${domain}` : "";
}

/** The file worth keeping as the receipt: a PDF first, else the largest photo (a logo in a signature is small). Pure. */
export function bestFile(files = []) {
  const pdf = files.find((f) => f.type === "application/pdf");
  if (pdf) return pdf;
  const photos = files.filter((f) => f.size >= 20_000).sort((a, b) => b.size - a.size);
  return photos[0] ?? null;
}

export function createReceiptMail({ env = process.env, fetch = globalThis.fetch, token = null, registry, auditLog = null, mailbox = null, random = randomInt, now = () => new Date() } = {}) {
  if (!registry?.getShop || !registry?.updateShop) throw new Error("Receipts by email needs the shop registry");
  const settings = platformSettings(env);
  const available = hasReceiptMail(env);
  let reader = mailbox;
  const box = () => (reader ??= receiptMailbox({ fetch, token: token ?? metadataToken({ fetch }), account: mailAccount(env), mailbox: settings.senderEmail }));
  const addressOf = (shopId, state) => receiptAddress(settings.receiptsEmail, shopId, state?.code);
  const view = (shopId, state) => ({ available, on: available && state?.on === true, address: available ? addressOf(shopId, state) : "" });

  async function record(shopId, kind, by) {
    const at = now().toISOString();
    const entry = { id: `${at}-${kind}`, kind, at, ...(by ? { by: String(by).slice(0, 200) } : {}) };
    try { if (auditLog && (await auditLog.ready(shopId))) await auditLog.write(shopId, entry.id, entry); }
    catch (error) { console.error(`receipts: the audit log entry for ${shopId} wasn't written: ${error?.message ?? error}`); }
  }
  const needOn = () => { if (!available) throw new SignupError(409, "Receipts by email isn't open yet."); };
  const stateOf = async (shopId) => (await registry.getShop(shopId))?.receiptMail ?? null;
  /** The message, only when its own headers name this shop's current address. */
  async function mine(shopId, state, id) {
    const address = addressOf(shopId, state);
    if (!address || !ID.test(String(id ?? ""))) return null;
    let message;
    try { message = await box().read(id); } catch (error) { if (error.status === 404) return null; throw error; }
    return message.addressedTo.includes(address) ? message : null;
  }

  const OPS = {
    "receipts.status": async (shopId) => view(shopId, await stateOf(shopId)),
    // Safe to run twice: a shop that already has an address keeps it.
    "receipts.start": async (shopId, args) => {
      needOn();
      const state = await stateOf(shopId);
      if (state?.on === true && CODE.test(state.code ?? "")) return view(shopId, state);
      const next = { ...(state ?? {}), code: CODE.test(state?.code ?? "") ? state.code : newCode(random), on: true, startedAt: now().toISOString() };
      await registry.updateShop(shopId, { receiptMail: next });
      await record(shopId, "receipt-mail-on", args.by);
      return view(shopId, next);
    },
    "receipts.stop": async (shopId, args) => {
      const state = await stateOf(shopId);
      if (state?.on !== true) return view(shopId, state);
      const next = { ...state, on: false, stoppedAt: now().toISOString() };
      await registry.updateShop(shopId, { receiptMail: next });
      await record(shopId, "receipt-mail-off", args.by);
      return view(shopId, next);
    },
    "receipts.newAddress": async (shopId, args) => {
      needOn();
      const state = await stateOf(shopId);
      const next = { ...(state ?? {}), code: newCode(random), on: true, startedAt: state?.startedAt ?? now().toISOString() };
      await registry.updateShop(shopId, { receiptMail: next });
      await record(shopId, "receipt-mail-new-address", args.by);
      return view(shopId, next);
    },
    "receipts.pull": async (shopId, args) => {
      needOn();
      const state = await stateOf(shopId);
      if (state?.on !== true) return { emails: [], more: false };
      const have = new Set(Array.isArray(args.have) ? args.have.filter((id) => typeof id === "string").slice(0, 500) : []);
      const day = now().toISOString().slice(0, 10);
      let handed = state.day === day ? Number(state.handed) || 0 : 0;
      const fresh = (await box().find(addressOf(shopId, state), 40)).filter((id) => !have.has(id));
      const emails = [];
      let looked = 0;
      for (const id of fresh) {
        if (emails.length >= PULL_BATCH || handed >= DAILY_LIMIT) break;
        looked += 1;
        const message = await mine(shopId, state, id);
        if (!message) continue;
        const confirm = forwardingConfirmation(message);
        const chosen = confirm ? null : bestFile(message.files);
        const file = chosen ? await box().file(id, chosen) : null;
        emails.push({ id, from: message.from, subject: message.subject, receivedAt: message.receivedAt, text: message.text, ...(file ? { file } : {}), ...(confirm ? { confirm } : {}) });
        handed += 1;
      }
      if (emails.length) await registry.updateShop(shopId, { receiptMail: { ...state, day, handed } });
      return { emails, more: handed < DAILY_LIMIT && looked < fresh.length };
    },
    "receipts.file": async (shopId, args) => {
      needOn();
      const message = await mine(shopId, await stateOf(shopId), args.id);
      if (!message) throw new SignupError(404, "That email is no longer in the receipts mailbox.");
      const chosen = bestFile(message.files);
      return { file: chosen ? await box().file(message.id, chosen) : null };
    },
    "receipts.done": async (shopId, args) => {
      needOn();
      const state = await stateOf(shopId);
      let done = 0;
      for (const id of Array.isArray(args.ids) ? args.ids.slice(0, 50) : []) {
        if (!(await mine(shopId, state, id))) continue;
        await box().bin(id);
        done += 1;
      }
      return { done };
    },
  };

  const header = (headers, name) => {
    const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
    return typeof found?.[1] === "string" ? found[1] : "";
  };

  return {
    available,
    /** For the control room: whether a shop has it on, its address and since when. */
    async forShop(shopId) {
      const state = await stateOf(shopId);
      return { ...view(shopId, state), startedAt: state?.startedAt ?? "", stoppedAt: state?.stoppedAt ?? "" };
    },
    async shopCall(request = {}) {
      const shopId = header(request.headers, "x-shop-id");
      const row = shopId ? await registry.getShop(shopId) : null;
      // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
      if (!row || !serviceKeyMatches(header(request.headers, "authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
        throw new SignupError(401, "This shop can't reach its receipts.");
      }
      if (row.status === "abandoned") throw new SignupError(403, "This shop is closed.");
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const op = Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
      if (!op) throw new SignupError(400, "Unknown call.");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
      return op(shopId, args);
    },
  };
}

export function receiptShopDoorRoutes(receipts) {
  return { "POST /api/receipts/shop": async (request) => receipts.shopCall(request) };
}
