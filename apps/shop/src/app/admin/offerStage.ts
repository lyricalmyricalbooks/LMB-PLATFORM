// Get started's first step, What you offer (shop types plan, part 1, 26 November 2026). Sign-up only asks the kind of shop
// (Product shop, Services or Both); this step asks the rest: what a product shop sells (and whether that includes books,
// the only way the book tools turn on), what people book, and for a shop doing both, what most customers come for.
// Pure: OfferStage.tsx draws it and saves `offerChange`'s answer in one write.
import { sellsBooks, sellsServices } from "../../shared/shopSells";
import { TYPE_GROUPS, type TypeGroupId } from "../../shared/productTypes";
import { groupsFor } from "./productGroups";
import { leadSideOf, shopKindOf, type LeadSide, type ShopType } from "./servicesSetup";

/** The step's marker in `firstWeek/start`: when the owner answered it. */
export type OfferMarker = { at: string };

type OfferDoc = { sells?: string | null; publishes?: string | null; sellsProducts?: boolean; leadSide?: string | null; productGroups?: unknown } | null | undefined;

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
}

/** The words a product group gives the shop's one-word answer (sign-up's PRODUCT_GROUPS mapping, signup/form.js). */
const GROUP_SELLS: Partial<Record<TypeGroupId, string>> = {
  clothing: "clothing", bags: "clothing", shoes: "shoes", jewelry: "jewelry", art: "prints", books: "mixed", music: "music",
};

/** The step's starting answers, read from what sign-up (or an earlier visit) saved. */
export function offerStart(doc: OfferDoc): OfferAnswers {
  const sells = doc?.sells || doc?.publishes || null;
  const kind = shopKindOf(doc);
  const picked = Array.isArray(doc?.productGroups) ? (doc.productGroups as unknown[]) : [];
  // A product shop with no picks yet starts with nothing chosen, so it says what it sells instead of keeping a guess.
  const groups = picked.length ? groupsFor(doc) : [];
  return { kind, groups, books: kind === "products" && sellsBooks(sells), does: sellsServices(sells) ? (sells as string) : "", lead: leadSideOf(doc) };
}

/** What still needs an answer before Continue, in plain words; "" when the answers are complete. */
export function offerProblem(a: OfferAnswers): string {
  if (a.kind !== "services" && !a.groups.length && !a.books) return "Pick at least one kind of thing you sell.";
  if (a.kind !== "products" && !a.does) return "Pick what people book.";
  return "";
}

/**
 * The one write the step makes. A product shop's one-word answer follows its picks: "books" (or the book answer it
 * already had) when it sells books, else its first group's word, so the book tools are on only for a shop that said
 * books. Services and Both save what people book; Both also its lead side.
 */
export function offerChange(a: OfferAnswers, doc: OfferDoc, at: string) {
  const was = doc?.sells || doc?.publishes || null;
  if (a.kind === "products") {
    const groups = a.books && !a.groups.includes("books") ? (["books", ...a.groups] as TypeGroupId[]) : a.groups;
    const ordered = TYPE_GROUPS.map((g) => g.id).filter((id) => groups.includes(id));
    const first = ordered[0];
    const sells = a.books ? (sellsBooks(was) ? (was as string) : "books") : (first && GROUP_SELLS[first]) || "other";
    return { sells, productGroups: ordered, offer: { at } };
  }
  const ordered = TYPE_GROUPS.map((g) => g.id).filter((id) => a.groups.includes(id));
  return {
    sells: a.does,
    ...(a.kind === "both" ? { leadSide: a.lead, ...(ordered.length ? { productGroups: ordered } : {}) } : {}),
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
