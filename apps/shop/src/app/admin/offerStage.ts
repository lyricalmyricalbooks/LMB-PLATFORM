// Get started's first step, What you offer (shop types plan, part 1, 26 November 2026). Sign-up only asks the kind of shop
// (Product shop, Services or Both); this step asks the rest: what a product shop sells (and whether that includes books,
// the only way the book tools turn on), what people book, and for a shop doing both, what most customers come for.
// Pure: OfferStage.tsx draws it and saves `offerChange`'s answer in one write.
import { sellsBooks, sellsServices } from "../../shared/shopSells";
import { TYPE_GROUPS, type TypeGroupId } from "../../shared/productTypes";
import { groupsFor } from "./productGroups";
import { leadSideOf, shopKindOf, type LeadSide, type ShopType } from "./servicesSetup";

/** The services answer that means "not in the list" (Other services). */
export const OTHER_SERVICE = "services";

/** The step's marker in `firstWeek/start`: when the owner answered it. */
export type OfferMarker = { at: string };

type OfferDoc = { sells?: string | null; publishes?: string | null; sellsProducts?: boolean; leadSide?: string | null; productGroups?: unknown; otherSells?: unknown; otherService?: unknown } | null | undefined;

/**
 * Julian, 26 November 2026: "always have the other option if it's not in the list". Every list of what a shop sells or
 * what people book ends in Something else, with a box for the owner's own words (`otherSells`, `otherService` in
 * `firstWeek/start`, at most OTHER_MAX characters). The words are kept as typed; they never turn tools on or off.
 */
export const OTHER_MAX = 80;
export const OTHER_LABEL = "Something else";
/** The owner's own words, trimmed and cut to OTHER_MAX; "" when there are none. */
export const otherWords = (value: unknown): string => (typeof value === "string" ? value.trim().slice(0, OTHER_MAX) : "");

/** The owner's answers on the step. */
export interface OfferAnswers {
  kind: ShopType;
  /** The kinds of things it sells (product shops and Both). */
  groups: TypeGroupId[];
  /** Sells books, zines or comics: turns the book tools on (product shops only). */
  books: boolean;
  /** What people book (Services and Both): a services answer. */
  does: string;
  /** What most customers come for (Both only). */
  lead: LeadSide;
  /** Something else is picked among the kinds of things, and the owner's words for it. */
  other: boolean;
  otherText: string;
  /** The owner's words when what people book is Other services. */
  serviceText: string;
}

/**
 * The words a product group gives the shop's one-word answer (sign-up's PRODUCT_GROUPS mapping, signup/form.js). Books
 * and paper gives "other": notebooks and cards are not books, and only the books tick turns the book tools on.
 */
const GROUP_SELLS: Partial<Record<TypeGroupId, string>> = {
  clothing: "clothing", bags: "clothing", shoes: "shoes", jewelry: "jewelry", art: "prints", music: "music",
};

/** A product shop's one-word answer without the book tools: its first kind's word, in the list's order, else "other". */
export function goodsSellsFor(groups: readonly TypeGroupId[]): string {
  const first = TYPE_GROUPS.map((g) => g.id).find((id) => groups.includes(id));
  return (first && GROUP_SELLS[first]) || "other";
}

/** The step's starting answers, read from what sign-up (or an earlier visit) saved. */
export function offerStart(doc: OfferDoc): OfferAnswers {
  const sells = doc?.sells || doc?.publishes || null;
  const kind = shopKindOf(doc);
  const picked = Array.isArray(doc?.productGroups) ? (doc.productGroups as unknown[]) : [];
  // A product shop with no picks yet starts with nothing chosen, so it says what it sells instead of keeping a guess.
  const groups = picked.length ? groupsFor(doc) : [];
  const otherText = otherWords(doc?.otherSells);
  return { kind, groups, books: kind === "products" && sellsBooks(sells), does: sellsServices(sells) ? (sells as string) : "", lead: leadSideOf(doc),
    other: !!otherText, otherText, serviceText: otherWords(doc?.otherService) };
}

/** What still needs an answer before Continue, in plain words; "" when the answers are complete. */
export function offerProblem(a: OfferAnswers): string {
  if (a.kind !== "services" && !a.groups.length && !a.books && !a.other) return "Pick at least one kind of thing you sell.";
  if (a.kind !== "services" && a.other && !otherWords(a.otherText)) return "Tell us what else you sell.";
  if (a.kind !== "products" && !a.does) return "Pick what people book.";
  if (a.kind !== "products" && a.does === OTHER_SERVICE && !otherWords(a.serviceText)) return "Tell us what people book.";
  return "";
}

/**
 * The one write the step makes. A product shop's one-word answer follows its picks: "books" (or the book answer it
 * already had) when it sells books, else its first group's word, so the book tools are on only for a shop that said
 * books. Services and Both save what people book; Both also its lead side.
 */
export function offerChange(a: OfferAnswers, doc: OfferDoc, at: string) {
  const was = doc?.sells || doc?.publishes || null;
  // The owner's own words go with the answer they belong to; "" clears words left from an earlier visit.
  const otherSells = a.kind !== "services" && a.other ? otherWords(a.otherText) : "";
  const otherService = a.kind !== "products" && a.does === OTHER_SERVICE ? otherWords(a.serviceText) : "";
  const own = { ...(otherSells || doc?.otherSells ? { otherSells } : {}), ...(otherService || doc?.otherService ? { otherService } : {}) };
  if (a.kind === "products") {
    const groups = a.books && !a.groups.includes("books") ? (["books", ...a.groups] as TypeGroupId[]) : a.groups;
    const ordered = TYPE_GROUPS.map((g) => g.id).filter((id) => groups.includes(id));
    const sells = a.books ? (sellsBooks(was) ? (was as string) : "books") : goodsSellsFor(ordered);
    return { sells, productGroups: ordered, ...own, offer: { at } };
  }
  const ordered = TYPE_GROUPS.map((g) => g.id).filter((id) => a.groups.includes(id));
  return {
    sells: a.does,
    ...(a.kind === "both" ? { leadSide: a.lead, ...(ordered.length ? { productGroups: ordered } : {}) } : {}),
    ...own,
    offer: { at },
  };
}

/** The open list's line for a finished step: "A product shop selling books", "Hair and beauty, with products". */
export function offerSummary(doc: OfferDoc, serviceLabel: (id: string) => string): string {
  const kind = shopKindOf(doc);
  const sells = doc?.sells || doc?.publishes || null;
  if (kind === "products") return sellsBooks(sells) ? "A product shop selling books, with the book tools on." : "A product shop.";
  const does = sells ? serviceLabel(sells) : "Services";
  return kind === "both" ? `${does}, with products too.` : `${does}.`;
}
