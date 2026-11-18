// The tip line at checkout (Donations & tips, beta): which choices to offer and what the picked one comes to. Pure, so
// the page and its tests agree. The server checks the tip again (functions/index.js `checkoutTipFor`): the switch, the
// bounds, never on a trade invoice. Amounts are cents of the shop's currency; a typed amount is in the shown currency.
import { checkoutTipProblem, cleanTipPercents, tipChoices } from "../../../shared/givingRules";
import { plainNumber } from "./extras/pdp-pay-what-you-want/payWhatYouWantBox";

/** No tip, a percent from the list, or the shopper's own amount. */
export type TipPick = "none" | "other" | number;

/** The percents to offer: the website's hint (`settings/website.givingTips`, kept by the server), empty when tips are off. */
export function tipsOffered(settings: unknown): number[] {
  const list = (settings as { givingTips?: unknown } | null | undefined)?.givingTips;
  return Array.isArray(list) && list.length ? cleanTipPercents(list) : [];
}

/** What the tip is worked out on: the items after any discount, never gift cards bought in the bag. Cents. */
export function tipBaseMinor(itemsSubtotal: number, giftCardLines: number, discount: number): number {
  return Math.max(0, Math.round((itemsSubtotal - giftCardLines - discount) * 100));
}

export type TipResult = { minor: number } | { problem: "tip" | "tipTooSmall" | "tipTooBig" };

/** The picked tip in cents, or why the typed one can't be taken. A blank "other" is no tip. */
export function tipFor(pick: TipPick, typed: string, baseMinor: number, percents: readonly number[], rate = 1): TipResult {
  if (pick === "none") return { minor: 0 };
  if (pick === "other") {
    const text = plainNumber(typed);
    if (!text) return { minor: 0 };
    const shown = Number(text);
    if (!Number.isFinite(shown) || shown < 0) return { problem: "tip" };
    const minor = Math.round((shown / (rate > 0 ? rate : 1)) * 100);
    const problem = checkoutTipProblem(minor);
    return problem ? { problem } : { minor };
  }
  if (!percents.includes(pick)) return { minor: 0 };
  const minor = tipChoices(baseMinor, [pick])[0].minor;
  // A percent of a tiny bag can come to under the lowest tip: then it is the lowest tip.
  const problem = checkoutTipProblem(minor);
  if (problem === "tipTooSmall") return { minor: minor > 0 ? 100 : 0 };
  if (problem === "tipTooBig") return { minor: 100_000 };
  return { minor };
}
