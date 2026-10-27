// Settings › Email sender (pure, tested). The server (functions/index.js sendEmail) reads
// settings/website `communications.fromName`, `.replyTo` and `.fromEmail`: the name customers see, where their
// replies go, and the address used by the Resend backup sender. `communications` is saved as one whole map, so a
// save must start from the stored map and change only these three keys.

export type Sender = { fromName: string; replyTo: string; fromEmail: string };

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function senderOf(communications: Record<string, any> | null | undefined): Sender {
  return { fromName: text(communications?.fromName), replyTo: text(communications?.replyTo), fromEmail: text(communications?.fromEmail) };
}

/** What is wrong with the sender details, keyed by field; empty when they can be saved. Blank fields are allowed. */
export function senderProblems(sender: Sender): Partial<Record<keyof Sender, string>> {
  const out: Partial<Record<keyof Sender, string>> = {};
  const name = text(sender.fromName);
  if (name.length > 80) out.fromName = "Keep the name under 80 characters.";
  else if (/[<>"\r\n]/.test(name)) out.fromName = "Leave out < > and quote marks.";
  if (text(sender.replyTo) && !EMAIL.test(text(sender.replyTo))) out.replyTo = "That doesn't look like an email address.";
  if (text(sender.fromEmail) && !EMAIL.test(text(sender.fromEmail))) out.fromEmail = "That doesn't look like an email address.";
  return out;
}

/** The whole `communications` map to store: the stored one with only the sender keys replaced (blank = removed, so the default applies). */
export function withSender(communications: Record<string, any> | null | undefined, sender: Sender): Record<string, any> {
  const next: Record<string, any> = { ...(communications || {}) };
  for (const key of ["fromName", "replyTo", "fromEmail"] as const) {
    const value = text(sender[key]);
    if (value) next[key] = value; else delete next[key];
  }
  return next;
}
