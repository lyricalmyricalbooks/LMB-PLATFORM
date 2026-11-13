// Bookkeeping › Receipts › Receipts by email (beta, 12 November 2026). The shop's own receipts address and the emailed
// receipts waiting to be checked, through the shop's server (functions/receiptInbox.js, action `receiptInbox`). The
// server only reads and keeps them waiting: an expense is added by the Log expense page, after the owner has looked.
import { auth } from "../../../lib/firebase";
import { functionFetch } from "../../lib/functionsBase";
import { blankExpense, type ExpenseForm } from "./taxExpense";
import { receiptPatch, type ReceiptFacts } from "./receiptRead";

export type WaitingReceipt = {
  id: string; from: string; subject: string; receivedAt: string; facts: Partial<ReceiptFacts> | null;
  /** False when the reader thinks the email isn't a receipt at all. */ looksLike: boolean;
  hasFile: boolean; fileName: string; snippet: string;
};
export type InboxView = {
  /** False until the platform has opened receipts by email: the page says "Opening soon". */ available: boolean;
  on: boolean; address: string; checkedAt: string;
  /** The code Gmail sends when the owner sets up automatic forwarding. */ gmailCode: { code: string; from: string } | null;
  waiting: WaitingReceipt[];
};

export const EMPTY_INBOX: InboxView = { available: false, on: false, address: "", checkedAt: "", gmailCode: null, waiting: [] };

/** "Example Print Co." out of `"Example Print Co." <billing@print.example>`; the address when there is no name. Pure. */
export function senderName(from: string): string {
  const name = /^\s*"?([^"<]*?)"?\s*</.exec(from)?.[1]?.trim();
  return name || from.replace(/[<>]/g, "").trim();
}

/** What a waiting receipt is called on its card: who it is from, else the email's subject. Pure. */
export function receiptTitle(r: Pick<WaitingReceipt, "facts" | "subject" | "from">): string {
  return String(r.facts?.vendor || "").trim() || r.subject.trim() || senderName(r.from) || "Emailed receipt";
}

/** The Log expense form an emailed receipt starts with; what the reader missed is left for the owner. Pure. */
export function formFromReceipt(r: WaitingReceipt, base: string, currencies: string[], today: string): ExpenseForm {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(r.receivedAt)?.[0] || today;
  const form = { ...blankExpense(base, day), ...receiptPatch(r.facts || {}, currencies) };
  if (!form.desc) form.desc = r.subject.trim() || senderName(r.from);
  return form;
}

/** "5 minutes ago" for the last look. Pure. */
export function checkedAgo(checkedAt: string, now = Date.now()): string {
  const at = Date.parse(checkedAt);
  if (!Number.isFinite(at)) return "Not checked yet";
  const mins = Math.max(0, Math.round((now - at) / 60000));
  if (mins < 1) return "Checked just now";
  if (mins < 60) return `Checked ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `Checked ${hours} h ago` : `Checked ${Math.round(hours / 24)} d ago`;
}

async function door(step: string, extra: Record<string, unknown> = {}): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "receiptInbox", step, ...extra }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "That didn't work just now. Try again in a minute."), { code: data?.code });
  return data;
}

const view = (d: any): InboxView => ({ ...EMPTY_INBOX, ...d, waiting: Array.isArray(d?.waiting) ? d.waiting : [] });

export const receiptInboxApi = {
  status: async (): Promise<InboxView> => view(await door("status")),
  start: async (): Promise<InboxView> => view(await door("start")),
  stop: async (): Promise<InboxView> => view(await door("stop")),
  newAddress: async (): Promise<InboxView> => view(await door("newAddress")),
  check: async (): Promise<InboxView> => view(await door("check")),
  codeSeen: async (): Promise<InboxView> => view(await door("codeSeen")),
  /** The receipt's own file: the attachment, or the email's words as a PDF. */
  file: async (id: string): Promise<File> => {
    const { file } = await door("file", { id });
    const bytes = Uint8Array.from(atob(String(file?.data || "")), (c) => c.charCodeAt(0));
    if (!bytes.length) throw new Error("The receipt's file couldn't be opened. Try again in a minute.");
    return new File([bytes], String(file.name || "receipt.pdf"), { type: String(file.type || "application/pdf") });
  },
  /** After Add or Not a receipt: the email is binned and leaves the list. */
  done: async (id: string): Promise<void> => { await door("done", { id }); },
};
export type ReceiptInboxApi = typeof receiptInboxApi;
