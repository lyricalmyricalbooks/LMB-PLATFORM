// Your first week (plan 3.3): a short checklist on the Overview, shaped by the one question a press answered at
// sign-up ("How do you sell today?", signup/form.js). Setup writes the answer once, in `firstWeek/start`; a shop
// that has no such document (made before this, or by hand) never shows the list. Pure: the card reads books and the
// launch checks it already has (launchReadiness.ts) and this works out each step.

import type { ReadinessItem } from "./launchReadiness";

/** The sign-up answers (signup/form.js QUESTION.options). Anything else, or none, gets the general list. */
export type SellingToday = "starting" | "fairs" | "online" | "shops" | "spreadsheet";
export const SELLING_TODAY: readonly SellingToday[] = ["starting", "fairs", "online", "shops", "spreadsheet"];

export interface FirstWeekDoc {
  sellingToday?: string | null;
  plan?: string;
  /** Steps the owner ticked by hand: step id → when. */
  done?: Record<string, string>;
  /** Set when the owner hides the list. */
  hiddenAt?: string;
}

export type StepId =
  | "bring-books" | "bring-customers" | "import-spreadsheet" | "add-books" | "photos" | "isbn" | "look" | "shipping"
  | "payments" | "publish" | "fair" | "address" | "share";

export interface FirstWeekStep {
  id: StepId;
  title: string;
  why: string;
  /** Admin page the step's button opens (riso/nav.ts ids), or none. */
  tab?: string;
  action?: string;
  /** "auto": worked out from the shop; "manual": the owner ticks it. */
  kind: "auto" | "manual";
  done: boolean;
}

type StepWords = Omit<FirstWeekStep, "done" | "kind" | "id">;

const WORDS: Record<StepId, StepWords> = {
  "bring-books": { title: "Bring your books over from your old shop", why: "Export your products from your old shop and choose that file in Import CSV. Photos, prices and editions come over as drafts, and old links keep working.", tab: "catalog", action: "Open Books" },
  "bring-customers": { title: "Bring your customers over", why: "Your customer list becomes private notes here, and people who agreed to your emails can join your newsletter.", tab: "customers", action: "Open Customers" },
  "import-spreadsheet": { title: "Import your spreadsheet", why: "Save your list of books as a CSV file and choose it in Import CSV. You see every book before anything is saved.", tab: "catalog", action: "Open Books" },
  "add-books": { title: "Add your first book", why: "A title, a price and a photo are enough to start. You can fill in the rest later.", tab: "catalog", action: "Open Books" },
  photos: { title: "Give every book a photo", why: "Books with a photo sell far better, and the shop looks finished.", tab: "catalog", action: "Open Books" },
  isbn: { title: "Add ISBNs to your books", why: "Bookshops and distributors order by ISBN, and it puts the barcode on your book pages.", tab: "catalog", action: "Open Books" },
  look: { title: "Choose your shop's look", why: "Pick a theme, your colours and your logo, so the shop feels like your press.", tab: "designer", action: "Open Design" },
  shipping: { title: "Set your shipping rates", why: "Shoppers see the price of delivery before they pay, so nobody is surprised.", tab: "shipping", action: "Open Shipping" },
  payments: { title: "Get ready to take payments", why: "Connect payments and try one checkout yourself, so the first real order goes through.", tab: "payments", action: "Open Payments" },
  publish: { title: "Put your first book on sale", why: "Publishing checks the book first, then shoppers can buy it.", tab: "catalog", action: "Open Books" },
  fair: { title: "Get ready for your next fair", why: "Open the stockroom on your phone before the fair. Sales you take there come off the same stock as the website." },
  address: { title: "Point your web address at this shop", why: "Once your address leads here, people who bookmarked or searched for your old shop land on the same books.", tab: "general", action: "Open General settings" },
  share: { title: "Tell people your shop is open", why: "Share the link in your newsletter, on social media and at your next event.", },
};

/** The steps for each answer, in order. */
const ORDER: Record<SellingToday | "general", StepId[]> = {
  starting: ["add-books", "photos", "look", "shipping", "payments", "publish", "share"],
  fairs: ["add-books", "photos", "payments", "fair", "shipping", "publish", "share"],
  online: ["bring-books", "bring-customers", "photos", "look", "shipping", "payments", "publish", "address"],
  shops: ["add-books", "isbn", "photos", "shipping", "payments", "publish", "share"],
  spreadsheet: ["import-spreadsheet", "photos", "look", "shipping", "payments", "publish", "share"],
  general: ["add-books", "photos", "look", "shipping", "payments", "publish", "share"],
};

const MANUAL = new Set<StepId>(["bring-customers", "look", "fair", "address", "share"]);

export interface FirstWeekFacts {
  books: any[] | null;
  readiness: ReadinessItem[] | null;
}

const hasPhoto = (b: any) => !!(b?.photos?.length || b?.coverImage || b?.image || b?.photoUrl);
const live = (b: any) => (b?.status || "published") === "published";

/** Whether a step is done from what the shop holds; null when the shop can't tell (the owner ticks it). */
function autoDone(id: StepId, { books, readiness }: FirstWeekFacts): boolean | null {
  const list = books || [];
  const ok = (check: string) => readiness?.find(i => i.id === check)?.status === "ok";
  switch (id) {
    case "bring-books": case "import-spreadsheet": case "add-books": return list.length > 0;
    case "photos": return list.length > 0 && list.every(hasPhoto);
    case "isbn": return list.length > 0 && list.every(b => String(b?.isbn || "").replace(/[^0-9X]/gi, "").length >= 10);
    case "publish": return list.some(live);
    case "shipping": return ok("shipping");
    case "payments": return ok("payments") && !readiness?.some(i => i.id === "stripe-secret" && i.status !== "ok");
    default: return null;
  }
}

/** The plan the stockroom is part of (the fair step names it only then). */
const hasStockroom = (plan?: string) => plan === "both" || plan === "stockroom";

export function firstWeekSteps(doc: FirstWeekDoc, facts: FirstWeekFacts): FirstWeekStep[] {
  const answer = SELLING_TODAY.includes(doc.sellingToday as SellingToday) ? (doc.sellingToday as SellingToday) : "general";
  return ORDER[answer].map(id => {
    const words = { ...WORDS[id] };
    if (id === "fair" && !hasStockroom(doc.plan)) words.why = "Bring a card reader or a payment link, and note what you sell so you can take it off your stock afterwards.";
    const auto = MANUAL.has(id) ? null : autoDone(id, facts);
    const ticked = !!doc.done?.[id];
    const { tab, action, title, why } = words;
    return { id, title, why, ...(tab ? { tab, action } : {}), kind: auto === null ? "manual" : "auto", done: auto === null ? ticked : auto || ticked };
  });
}

/** Shown while the shop has the document, the owner hasn't hidden it, and something is left to do. */
export function showFirstWeek(doc: FirstWeekDoc | null, steps: FirstWeekStep[]): boolean {
  return !!doc && !doc.hiddenAt && steps.some(s => !s.done);
}

/** The intro line, in the owner's words. */
export function firstWeekIntro(doc: FirstWeekDoc): string {
  switch (doc.sellingToday) {
    case "online": return "You told us you sell through another online shop, so these steps bring it over first.";
    case "fairs": return "You told us you sell at fairs and markets, so these steps get you ready for both.";
    case "shops": return "You told us you sell through bookshops and distributors, so these steps start with what they need.";
    case "spreadsheet": return "You told us you keep track in a spreadsheet, so these steps start from it.";
    case "starting": return "You're just starting out, so these steps take you from your first book to your first sale.";
    default: return "A few steps take you from your first book to your first sale.";
  }
}
