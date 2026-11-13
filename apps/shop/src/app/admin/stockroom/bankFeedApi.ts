// Bookkeeping › Transactions › Bank feed (beta, 13 November 2026). A paid add-on: the owner connects the shop's bank
// in the bank's own window, and each bank transaction waits here until it is matched to a card payout or an expense
// already in the books, added as a new expense, or skipped. Read-only: nothing here can move money. Everything goes
// through the shop's server (functions/bankFeed.js, action `bankFeed`), which asks the platform's bank door; the
// bank's sign-in and the key that reads the transactions never reach this page.
import { auth } from "../../../lib/firebase";
import { functionFetch } from "../../lib/functionsBase";

/** One line from the bank. `cents` is above 0 for money in and below 0 for money out. */
export type BankLine = {
  id: string; bankId: string; date: string; cents: number; currency: string; name: string;
  /** "Chequing ••1234" */ account: string; /** The bank hasn't settled it yet: shown, but not matched. */ pending?: boolean;
};
export type ConnectedBank = { id: string; name: string; accounts: string[]; connectedAt: string; /** The bank wants the owner to sign in again. */ needsSignIn?: boolean };
/** What a bank line was matched to. `ref` is the payout's or the expense's id; empty for a skipped line. */
export type BankMatch = { lineId: string; kind: "payout" | "expense" | "added" | "skipped"; ref: string };
export type BankAddOn = {
  on: boolean; /** "CA$4" */ price: string; /** "CA$1.50" */ extraPrice: string; /** Banks the price covers. */ included: number;
  /** Set when the add-on was turned off and the banks were disconnected. */ offSince?: string;
};
export type BankView = {
  /** False until the platform has opened the bank feed: the page says "Opening soon". */ available: boolean;
  addOn: BankAddOn; banks: ConnectedBank[]; checkedAt: string; waiting: BankLine[]; matches: BankMatch[];
};

export const EMPTY_BANK_VIEW: BankView = { available: false, addOn: { on: false, price: "", extraPrice: "", included: 2 }, banks: [], checkedAt: "", waiting: [], matches: [] };

/** "CA$4 a month for up to two banks, then CA$1.50 for each extra bank." Pure. */
export function addOnPriceWords(addOn: Pick<BankAddOn, "price" | "extraPrice" | "included">): string {
  if (!addOn.price) return "";
  const count = ["no", "one", "two", "three", "four"][addOn.included] ?? String(addOn.included);
  return `${addOn.price} a month for up to ${count} bank${addOn.included === 1 ? "" : "s"}${addOn.extraPrice ? `, then ${addOn.extraPrice} for each extra bank` : ""}.`;
}

/** What connecting one more bank costs, or "" while it is covered. Pure. */
export function nextBankWords(view: Pick<BankView, "addOn" | "banks">): string {
  return view.banks.length >= view.addOn.included && view.addOn.extraPrice ? `One more bank adds ${view.addOn.extraPrice} a month.` : "";
}

async function door(step: string, extra: Record<string, unknown> = {}): Promise<any> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  let res: Response;
  try {
    res = await functionFetch("createStripeCheckoutSession", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "bankFeed", step, ...extra }),
    });
  } catch {
    throw new Error("Couldn't reach the shop's server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || "That didn't work just now. Try again in a minute."), { code: data?.code });
  return data;
}

const view = (d: any): BankView => ({
  ...EMPTY_BANK_VIEW, ...d, addOn: { ...EMPTY_BANK_VIEW.addOn, ...(d?.addOn || {}) },
  banks: Array.isArray(d?.banks) ? d.banks : [], waiting: Array.isArray(d?.waiting) ? d.waiting : [], matches: Array.isArray(d?.matches) ? d.matches : [],
});

/** The bank's own sign-in window (Plaid Link), loaded only when the owner presses Connect. */
const LINK_SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
let linkLoading: Promise<void> | null = null;
function loadLink(): Promise<void> {
  if ((window as any).Plaid) return Promise.resolve();
  return (linkLoading ??= new Promise<void>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = LINK_SCRIPT; tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => { linkLoading = null; tag.remove(); reject(new Error("The bank sign-in window couldn't open. Check your connection and try again.")); };
    document.head.appendChild(tag);
  }));
}

export const bankFeedApi = {
  status: async (): Promise<BankView> => view(await door("status")),
  /** Collects new lines from the banks now, then answers like status. */
  check: async (): Promise<BankView> => view(await door("check")),
  /**
   * Opens the bank's own sign-in window. Resolves with the new view once a bank is connected, or null when the owner
   * closed the window. `bankId` signs in again to a bank that asked for it.
   */
  connect: async (bankId?: string): Promise<BankView | null> => {
    const { token } = await door("linkToken", bankId ? { bankId } : {});
    await loadLink();
    return new Promise<BankView | null>((resolve, reject) => {
      const handler = (window as any).Plaid.create({
        token,
        onSuccess: (publicToken: string, meta: any) => {
          door(bankId ? "signedIn" : "connect", { publicToken, bankId, bankName: String(meta?.institution?.name || "") }).then((d) => resolve(view(d)), reject).finally(() => handler.destroy?.());
        },
        onExit: () => { handler.destroy?.(); resolve(null); },
      });
      handler.open();
    });
  },
  disconnect: async (bankId: string): Promise<BankView> => view(await door("disconnect", { bankId })),
  /** Records what the owner decided for these lines; they leave the list. */
  decide: async (matches: BankMatch[]): Promise<BankView> => view(await door("decide", { matches })),
};
export type BankFeedApi = typeof bankFeedApi;
