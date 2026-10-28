// Settings › Bookkeeping (code plan 7.16), pure and tested: the QuickBooks link's three steps, its words and what the
// page shows. The platform's bookkeeping service (LMB-PLATFORM services/accounting) does the work; the shop's server
// passes each step on (functions/bookkeeping.js).

export type BookkeepingStyle = "daily" | "orders";

export type BookkeepingStatus = {
  enabled: boolean;
  mode?: "live" | "test";
  connected?: boolean;
  companyName?: string | null;
  /** "lost": QuickBooks stopped answering; "disconnected": the owner pressed Disconnect. */
  problem?: "lost" | "disconnected" | null;
  disconnectedAt?: string | null;
  style?: BookkeepingStyle | null;
  ready?: boolean;
  taxCodes?: Record<string, string>;
  noTaxCode?: string | null;
  lastSent?: { date: string; at: string } | null;
  endsAt?: string | null;
  endsSoon?: boolean;
};

export type QuickBooksAccount = { id: string; name: string; type: string; subType: string | null };
export type AccountPart = "income" | "clearing" | "bank" | "fees" | "giftCards";
export type BookkeepingOptions = {
  taxCodes: { id: string; name: string; description: string | null }[];
  accounts: Record<AccountPart, QuickBooksAccount[]>;
  suggested: Record<AccountPart, string | null>;
};

export type BookkeepingSave = {
  style: BookkeepingStyle;
  taxCodes: Record<string, string>;
  noTaxCode: string;
  accounts: Record<AccountPart, string>;
};

/** Intuit's rule: the button is words only, no logo inside. */
export const CONNECT_LABEL = "Connect to QuickBooks";

export const STYLE_CHOICES: { id: BookkeepingStyle; label: string; hint: string }[] = [
  { id: "daily", label: "One line per day", hint: "One sales receipt for each day's sales. Short books; best for most presses." },
  { id: "orders", label: "Every order", hint: "One sales receipt per order, so you can find each order in QuickBooks." },
];

export const ACCOUNT_PARTS: { id: AccountPart; label: string; hint: string }[] = [
  { id: "income", label: "Sales go to", hint: "The income account for book sales and shipping." },
  { id: "clearing", label: "Card sales wait in", hint: "Where money sits until the payout reaches your bank. Usually Undeposited Funds." },
  { id: "bank", label: "Payouts land in", hint: "The bank account your card payouts arrive in." },
  { id: "fees", label: "Card fees go to", hint: "The expense account for card processing fees." },
  { id: "giftCards", label: "Gift cards go to", hint: "A liability account: a gift card sold is money you still owe in books." },
];

/** Which of the three steps the page is on, or "done". `stage` is the step the owner opened (2 or 3), if any. */
export function currentStep(status: BookkeepingStatus | null, stage: 2 | 3 | null): 1 | 2 | 3 | "done" {
  if (!status?.connected) return 1;
  if (stage) return stage;
  return status.ready ? "done" : 2;
}

const ERROR_WORDS: Record<string, string> = {
  not_available: "Bookkeeping links aren't available for this shop.",
  accounting_off: "Bookkeeping links aren't turned on yet.",
  not_connected: "This shop isn't connected to QuickBooks yet. Press Connect to QuickBooks.",
  disconnected: "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again.",
  not_set_up: "Finish the three steps first.",
  not_ready: "That day's numbers can't be read yet. Try again tomorrow.",
  unreachable: "The platform didn't answer. Try again in a minute.",
  quickbooks_error: "QuickBooks didn't answer. Try again in a minute.",
};

/** Plain words for a refusal: the service's own sentence when it sent one, else the code's, else a general one. */
export function bookkeepingError(err: unknown, what: string): string {
  const e = (err ?? {}) as { code?: string; message?: string };
  const known = e.code ? ERROR_WORDS[e.code] : undefined;
  const said = typeof e.message === "string" && /[a-z]/.test(e.message) && !/^(Failed to fetch|NetworkError|Load failed|TypeError)/i.test(e.message) ? e.message : "";
  const reason = said || known || "Something went wrong. Try again in a moment.";
  return `Couldn't ${what}. ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`;
}

/** What Intuit's sign-in answer (`?quickbooks=` on the way back) means, in plain words. */
export function connectOutcome(outcome: string | null): { tone: "success" | "warning" | "danger"; text: string } | null {
  switch (outcome) {
    case "connected": return { tone: "success", text: "QuickBooks is connected. Now choose how your sales are sent." };
    case "denied": return { tone: "warning", text: "QuickBooks wasn't connected: the sign-in was cancelled." };
    case "in_use": return { tone: "danger", text: "That QuickBooks company is already connected to another shop." };
    case "other_company": return { tone: "danger", text: "This shop is connected to another QuickBooks company. Disconnect it first." };
    case "failed": return { tone: "danger", text: "QuickBooks couldn't be connected. Try again in a minute." };
    default: return null;
  }
}

/** The tax names this shop sends: each rate's name in your books (plan 7.11), else its place. Sorted, no repeats. */
export function shopTaxNames(rates: { country?: string; region?: string; rate?: string; bookName?: string }[], saved: Record<string, string> = {}): string[] {
  const names = new Set(Object.keys(saved));
  for (const r of rates || []) {
    if (Number(r.rate) === 0) continue;
    const name = (r.bookName || "").trim() || `Tax ${(r.region || r.country || "").trim()}`.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Step 3's first picks: what was saved, else a QuickBooks tax code with the same name. */
export function firstMatches(names: string[], codes: { id: string; name: string }[], saved: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of names) {
    const same = codes.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const pick = saved[name] && codes.some((c) => c.id === saved[name]) ? saved[name] : same?.id;
    if (pick) out[name] = pick;
  }
  return out;
}

/** The step-3 form's problem, or "" when it can be saved. */
export function saveProblem(names: string[], draft: { taxCodes?: Record<string, string>; noTaxCode?: string; accounts?: Partial<Record<AccountPart, string>> }): string {
  const missing = names.find((name) => !draft.taxCodes?.[name]);
  if (missing) return `Choose a QuickBooks tax code for ${missing}.`;
  if (!draft.noTaxCode) return "Choose the tax code for sales with no tax.";
  const part = ACCOUNT_PARTS.find((p) => !draft.accounts?.[p.id]);
  if (part) return `Choose an account for "${part.label}".`;
  return "";
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function lastSentText(lastSent: BookkeepingStatus["lastSent"]): string {
  return lastSent?.date ? `Sales sent up to ${day(lastSent.date)}.` : "Nothing sent yet. The first night's run sends yesterday's sales.";
}

export function endsText(endsAt: string | null | undefined): string {
  return endsAt ? `This connection ends on ${day(endsAt)}. Connect again before then to keep sending.` : "";
}

/** Yesterday, as Send again's first pick (YYYY-MM-DD, the shop's calendar day in Toronto). */
export function yesterday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now.getTime() - 86_400_000));
}
