// The demo's practice inbox: a stand-in for the shop's email sender (Resend), on this computer only. The shop's server
// code sends its emails here (the emulators run with RESEND_BASE_URL pointing at it), and nothing leaves the computer.
// Every email is kept in .demo/inbox.json and shown at /inbox on the practice service (practiceServices.js): order
// confirmations, shipping and refund notices, the owner's new-order alerts, sign-in links and the rest.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** The key the demo gives the shop for sending; the practice inbox takes any key. */
export const PRACTICE_MAIL_KEY = "re_practice_walkthrough";
const KEEP = 200;

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []).map(String);

/** The inbox: `{ send(message), all(), one(id), clear() }`, saved to `file` (when given) after each change. */
export function createPracticeInbox({ file = null, now = () => new Date() } = {}) {
  let mail = [];
  if (file && existsSync(file)) {
    try { mail = JSON.parse(readFileSync(file, "utf8")); } catch { mail = []; }
  }
  const save = () => { if (file) writeFileSync(file, JSON.stringify(mail, null, 1)); };

  function send(message = {}) {
    const entry = {
      id: `practice-${randomBytes(8).toString("hex")}`,
      at: now().toISOString(),
      from: String(message.from ?? ""),
      to: asList(message.to),
      cc: asList(message.cc),
      bcc: asList(message.bcc),
      replyTo: asList(message.reply_to ?? message.replyTo),
      subject: String(message.subject ?? "(no subject)"),
      html: typeof message.html === "string" ? message.html : "",
      text: typeof message.text === "string" ? message.text : "",
      attachments: (message.attachments ?? []).map((a) => String(a?.filename ?? "attachment")),
    };
    mail = [entry, ...mail].slice(0, KEEP);
    save();
    return entry;
  }

  return {
    send,
    all: () => mail,
    one: (id) => mail.find((entry) => entry.id === id) ?? null,
    clear() { mail = []; save(); },
  };
}

/** Answers the email sender's API the way Resend does: POST /emails and POST /emails/batch. Anything else: null. */
export function practiceMailApi(inbox, method, path, body) {
  if (method === "POST" && path === "/emails") return { status: 200, body: { id: inbox.send(body).id } };
  if (method === "POST" && path === "/emails/batch") return { status: 200, body: { data: (Array.isArray(body) ? body : []).map((m) => ({ id: inbox.send(m).id })) } };
  if (method === "GET" && path === "/domains") return { status: 200, body: { data: [{ id: "practice-domain", name: "yourpress.example", status: "verified" }] } };
  return null;
}
