// Order detail's status bar (v4 mockup 1b): what the order needs next, in one line, and the button that does it. The
// button does exactly what the step's own main button below does (Confirm address, Confirm packed, mark shipped, Mark
// delivered); where that step needs choices first (a label's parcel and rate, a wrong address) it takes you there.
import { addressIssues, addressKey, blockingProblem, copiesToSend, isDigitalItem, packingKey, physicalItems, queueOf } from "./fulfillment";

export type OrderNextAct = "review" | "correct" | "pack" | "label" | "dispatch" | "deliver";
export interface OrderNext {
  /** "Next: Pack 3 items". */
  text: string;
  /** The status bar's button. */
  label: string;
  act: OrderNextAct;
  /** The step below it belongs to (the button scrolls there when it can't act yet). */
  step: "address" | "pack" | "ship";
  /** Can't act from the bar yet (lines still to tick, a test label): the button takes you to the step instead. */
  blocked: boolean;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The shipping step an order is on, or null when the bar has nothing to do: unpaid, a test order, cancelled or
 * finished, on hold, blocked by a problem, pickup or local delivery (their own buttons), or nothing to post.
 * `checked`: the lines ticked in the box so far.
 */
export function orderNextStep(order: any, checked: ReadonlySet<number>): OrderNext | null {
  if (!order || order.isTest || order.paymentStatus !== "paid") return null;
  if (!physicalItems(order).length) return null;
  if ((order.fulfillmentSelection?.method || "shipping") !== "shipping") return null;
  if (order.operations?.hold || blockingProblem(order)) return null;
  const queue = queueOf(order);
  const active = ["Needs attention", "Ready to pack", "Ready to ship"].includes(queue);
  if (active && order.operations?.addressReviewed !== addressKey(order)) {
    return addressIssues(order).length
      ? { text: "Next: Correct the address", label: "Correct address", act: "correct", step: "address", blocked: false }
      : { text: "Next: Check the address", label: "Confirm address", act: "review", step: "address", blocked: false };
  }
  if (queue === "Ready to pack" && order.operations?.packed !== packingKey(order)) {
    const lines = (order.items || []).map((item: any, index: number) => (!isDigitalItem(item) && copiesToSend(order, index) > 0 ? index : -1))
      .filter((index: number) => index >= 0);
    const copies = lines.reduce((n: number, index: number) => n + copiesToSend(order, index), 0);
    const ticked = lines.filter((index: number) => checked.has(index)).length;
    return { text: `Next: Pack ${plural(copies, "item")}`, label: "Mark as packed", act: "pack", step: "pack", blocked: lines.length > 1 && ticked !== lines.length };
  }
  if (queue === "Ready to ship") {
    if (!order.labelUrl) return { text: "Next: Buy a label", label: "Buy a label", act: "label", step: "ship", blocked: false };
    // A Shippo test-key label carries no parcel: shipping on it would email a dead tracking number.
    return { text: "Next: Hand the parcel over", label: "Mark shipped", act: "dispatch", step: "ship", blocked: order.operations?.labelTest === true };
  }
  if (queue === "In transit") return { text: "Next: Confirm delivery", label: "Mark delivered", act: "deliver", step: "ship", blocked: false };
  return null;
}
