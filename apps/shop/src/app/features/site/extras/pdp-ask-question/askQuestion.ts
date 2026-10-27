// "Ask a question about this book" (Studio › Style › Book page · photos & layout › showPdpAskQuestion).
// Pure rules: what the little form needs before it may send, and the subject the shop sees in Messages.
// The limits match firestore.rules' contactMessages create rule, so a valid form is never refused for size.
import { isValidAlertEmail } from "../../BackInStockForm";

export type QuestionDraft = { name: string; email: string; message: string };

/** The first thing missing, or null when the question may be sent. */
export function questionProblem(draft: QuestionDraft): "name" | "email" | "message" | null {
  if (!draft.name.trim() || draft.name.trim().length > 120) return "name";
  if (!isValidAlertEmail(draft.email)) return "email";
  if (!draft.message.trim() || draft.message.trim().length > 5000) return "message";
  return null;
}

/** "Question about <title> (<edition>)", cut to the rule's 200 characters. */
export function questionSubject(template: string, title: string, edition?: string): string {
  const name = [String(title || "").trim(), edition ? `(${String(edition).trim()})` : ""].filter(Boolean).join(" ");
  return String(template || "").replace(/\{title\}/g, name).trim().slice(0, 200);
}
