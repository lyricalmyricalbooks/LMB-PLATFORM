// Changing what kind of shop you are (shop types plan, part 3, 26 November 2026). Settings › General › What you offer ›
// Change walks through four short steps: pick the new type, see what changes, choose how the website changes, confirm.
// The change is three fields of `firstWeek/start` (`sells`, `sellsProducts`, `leadSide`) plus a `typeChange` record of
// what they were before, so Switch back puts them back for 30 days. Nothing is deleted: products, orders, services,
// bookings and clients all stay, and the menu shows the pages that fit the type. Pure, so the dialog and tests share it.
import { SELLS, sellsServices } from "../../shared/shopSells";
import { TYPE_GROUPS, type TypeGroupId } from "../../shared/productTypes";
import { goodsSellsFor, otherWords } from "./offerStage";
import { groupsFor } from "./productGroups";
import { shopKindOf, type LeadSide, type ShopType } from "./servicesSetup";

export type { ShopType };

/** How the website follows the new type (part 4 applies "follow"). */
export type WebsiteChoice = "follow" | "pick" | "later";

/** What the shop was before a change, so Switch back can put it back. */
/** `bookingPage`: the Book a time page was open, so Switch back opens it again (leaving services closes it). */
export type TypeBefore = { sells: string; sellsProducts: boolean; leadSide: LeadSide; bookingPage?: boolean };
export type TypeChange = { at: string; from: ShopType; to: ShopType; before: TypeBefore; website: WebsiteChoice; undoneAt?: string };

/** How long Switch back is offered. */
export const SWITCH_BACK_DAYS = 30;
const DAY = 86_400_000;

export const TYPE_CHOICES: { id: ShopType; name: string; blurb: string }[] = [
  { id: "products", name: "Product shop", blurb: "You sell things people buy and take home or have shipped." },
  { id: "services", name: "Services", blurb: "People book a time with you: appointments, lessons or classes." },
  { id: "both", name: "Products and services", blurb: "People book with you, and you sell things too." },
];
export const typeName = (t: ShopType) => TYPE_CHOICES.find((c) => c.id === t)?.name ?? t;

type Doc = { sells?: string | null; publishes?: string | null; sellsProducts?: boolean; leadSide?: LeadSide; productGroups?: unknown; typeChange?: TypeChange | null } | null | undefined;

const KNOWN = new Set<string>(SELLS);
/** The shop's answer as the rules take it: a sign-up answer outside today's list becomes its kinds' word. */
function savedSells(doc: Doc): string {
  const s = doc?.sells || doc?.publishes || "";
  if (s && KNOWN.has(s)) return s;
  return goodsSellsFor(groupsFor(doc));
}

/** The answers a change asks for: what people book (into Services or Both), the kinds of things (into Products), the lead side (into Both). */
export type TypeAnswers = { service?: string; serviceWords?: string; groups?: TypeGroupId[]; otherWords?: string; lead?: LeadSide };

/** What the new type still needs answered before Next, in words, or "". */
export function answersProblem(from: ShopType, to: ShopType, a: TypeAnswers): string {
  if (to === from) return "Pick a different type, or close this to keep yours.";
  if (to !== "products" && from === "products") {
    if (!a.service) return "Pick what people book with you.";
    if (a.service === "services" && !otherWords(a.serviceWords)) return "Tell us what people book.";
  }
  if (to === "products" && from === "services") {
    if (!(a.groups?.length) && !otherWords(a.otherWords)) return "Pick at least one kind of thing you sell.";
  }
  return "";
}

/**
 * The `firstWeek/start` fields the change writes. A product shop moving to services or both takes the booking answer as
 * its `sells`; a services shop moving to products takes its kinds' word (books when it picked Books and paper, which
 * turns the book tools on, as in Settings). The record keeps the before so Switch back can put it back.
 */
export function typeChangeWrite(doc: Doc, to: ShopType, a: TypeAnswers, website: WebsiteChoice, at: string, bookingPage?: boolean) {
  const from = shopKindOf(doc ?? null);
  const before: TypeBefore = { sells: savedSells(doc), sellsProducts: doc?.sellsProducts === true, leadSide: doc?.leadSide === "products" ? "products" : "services", ...(bookingPage ? { bookingPage: true } : {}) };
  const change: { sells?: string; sellsProducts: boolean; leadSide?: LeadSide; otherService?: string; otherSells?: string; productGroups?: string[]; typeChange: TypeChange } = {
    sellsProducts: to === "both",
    typeChange: { at, from, to, before, website },
  };
  if (to !== "products" && !sellsServices(before.sells)) {
    change.sells = a.service || "services";
    if (change.sells === "services") change.otherService = otherWords(a.serviceWords);
  }
  if (to === "products" && sellsServices(before.sells)) {
    const groups = a.groups ?? [];
    change.sells = groups.includes("books") ? "books" : goodsSellsFor(groups);
    change.productGroups = TYPE_GROUPS.map((g) => g.id).filter((id) => groups.includes(id));
    if (otherWords(a.otherWords)) change.otherSells = otherWords(a.otherWords);
  }
  if (to === "both") change.leadSide = a.lead ?? (from === "products" ? "products" : "services");
  return change;
}

/** The change Switch back can still undo, or null: one not undone yet, made in the last 30 days. */
export function switchBackOf(doc: Doc, now = Date.now()): TypeChange | null {
  const tc = doc?.typeChange;
  if (!tc || tc.undoneAt || typeof tc.at !== "string") return null;
  const at = Date.parse(tc.at);
  if (!Number.isFinite(at) || now - at > SWITCH_BACK_DAYS * DAY || now < at - DAY) return null;
  if (shopKindOf(doc ?? null) !== tc.to) return null;
  return tc;
}

/** The last day Switch back is offered, for "until 26 December". */
export const switchBackUntil = (tc: TypeChange) => new Date(Date.parse(tc.at) + SWITCH_BACK_DAYS * DAY);

/** The fields Switch back writes: the type as it was, and the record marked undone. */
export function switchBackWrite(tc: TypeChange, at: string) {
  return { sells: tc.before.sells, sellsProducts: tc.before.sellsProducts, leadSide: tc.before.leadSide, typeChange: { ...tc, undoneAt: at } };
}

/** What the shop has, for "what changes" (null where a count couldn't be read). */
export type TypeCounts = { products: number | null; orders: number | null; services: number | null; upcoming: number | null; clients: number | null };

const n = (count: number | null, one: string, many: string) => (count === null ? many.replace(/^\S+ /, "") : `${count} ${count === 1 ? one : many}`);
const hasProducts = (t: ShopType) => t !== "services";
const hasServices = (t: ShopType) => t !== "products";

/** "What changes", in three lists of plain lines: what stays, what's added to the menu, what the menu hides (kept, not deleted). */
export function whatChanges(from: ShopType, to: ShopType, c: TypeCounts): { stays: string[]; added: string[]; hidden: string[] } {
  const stays: string[] = [], added: string[] = [], hidden: string[] = [];
  if (hasProducts(from)) {
    const things = `Your ${n(c.products, "product", "products")} and ${n(c.orders, "order", "orders")}`;
    if (hasProducts(to)) stays.push(things);
    else hidden.push(`${things}: kept, out of your menu`);
  }
  if (hasServices(from)) {
    const things = `Your ${n(c.services, "service", "services")}, ${n(c.upcoming, "upcoming booking", "upcoming bookings")} and ${n(c.clients, "client", "clients")}`;
    if (hasServices(to)) stays.push(things);
    else hidden.push(`${things}: kept`);
  }
  stays.push("Your website address, payments, gift cards and team");
  if (hasServices(to) && !hasServices(from)) added.push("Calendar, Clients and Money in your menu", "A Book a time page for your website");
  if (hasProducts(to) && !hasProducts(from)) added.push("Products, Orders, stock and shipping in your menu");
  if (from !== "both" && to === "both") added.push("Your menu leads with what most customers come for");
  if (hasProducts(from) && !hasProducts(to)) hidden.push("Products, Orders, stock and shipping pages");
  if (hasServices(from) && !hasServices(to)) hidden.push("Book a time on your website (your calendar moves under Ways to sell)");
  return { stays, added, hidden };
}

/** Whether the change leaves the bookings side behind (so upcoming bookings need an answer). */
export const leavesServices = (from: ShopType, to: ShopType) => hasServices(from) && !hasServices(to);
/** Whether the change needs Bookings turned on for the shop first (a product shop taking bookings). */
export const needsBookings = (from: ShopType, to: ShopType) => !hasServices(from) && hasServices(to);
