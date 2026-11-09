// Overview › Your move so far (plan 23.17): which parts of the old shop have come over, for a press that brought its
// shop with it in Get started. Each bring-over window ticks its own part once it saves something (`recordMoveStep`),
// and the press can tick a part by hand when the old shop had none. Pure apart from `recordMoveStep`; the ticks live in
// the admin-only `firstWeek/start` doc's `done` map, next to the setup guide's own.
import { adminApi } from "./api";
import type { FirstWeekDoc } from "./firstWeek";

export type MoveStepId = "move-books" | "move-customers" | "move-giftcards" | "move-orders" | "move-links";
/** Set when the press puts the list away. */
export const MOVE_HIDDEN = "move-list";

/**
 * `hash` opens a sub tab the Overview's page switch can't reach (Settings › General › Visitors & Google), and `anchor`
 * is the card on it to scroll to.
 */
export interface MoveStep { id: MoveStepId; title: string; why: string; tab: string; hash?: string; anchor?: string; action: string; done: boolean }

const STEPS: Omit<MoveStep, "done">[] = [
  { id: "move-books", title: "Books", why: "Your product file from the old shop, in Books › Import spreadsheet. Old book addresses are sent on to the new pages.", tab: "catalog", action: "Open Books" },
  { id: "move-customers", title: "Customers", why: "Your customer file, so you know who bought from you before. Nobody is emailed.", tab: "customers", action: "Bring customers over" },
  { id: "move-giftcards", title: "Gift cards", why: "Your gift card file, so cards people already hold still work here.", tab: "giftCards", action: "Bring gift cards over" },
  { id: "move-orders", title: "Past orders", why: "Your order file, kept as history: it counts in your reports and each customer's history, and changes no stock.", tab: "orders", action: "Bring past orders over" },
  { id: "move-links", title: "Pages and old links", why: "Check your old shop's links and bring your own pages over, so nothing old lands on page not found.", tab: "general", hash: "#settings/general/visitors", anchor: "gs-redirects", action: "Check your old links" },
];

/** Only for a press that brought its shop with it in Get started (not one that started fresh or sold elsewhere). */
export function movingShop(doc: FirstWeekDoc | null): boolean {
  const bring = doc?.bring;
  return !!bring && !bring.skipped && (!bring.from || bring.from === "online" || bring.from === "marketplace");
}

/** The five parts, each done once its window saved something or the press ticked it. Books came over in Get started. */
export function moveSteps(doc: FirstWeekDoc): MoveStep[] {
  return STEPS.map((s) => ({ ...s, done: !!doc.done?.[s.id] || (s.id === "move-books" && movingShop(doc)) }));
}

/** Something is left to bring over (whether or not the list is showing). */
export function moveUnfinished(doc: FirstWeekDoc | null): boolean {
  return movingShop(doc) && moveSteps(doc!).some((s) => !s.done);
}

/** Shown on the Overview while something is left and the press hasn't put it away. */
export function showMoveProgress(doc: FirstWeekDoc | null): boolean {
  return moveUnfinished(doc) && !doc?.done?.[MOVE_HIDDEN];
}

/**
 * Ticks a part once its bring-over window saved something. Best effort, and only for a shop the platform set up (one
 * with the doc): a shop without it never grows one, so it never starts showing the setup guide.
 */
export async function recordMoveStep(id: MoveStepId): Promise<void> {
  try {
    const doc = await adminApi.getFirstWeek();
    if (!movingShop(doc) || doc!.done?.[id]) return;
    await adminApi.updateFirstWeek({ done: { [id]: new Date().toISOString() } });
  } catch {
    // The list is a reminder: a missed tick can be ticked by hand.
  }
}
