import { expect, test } from "vitest";
import { redactedOrderFields } from "./privacyData.js";

test("erasing a customer blanks a payment link's note, and adds nothing to other orders", () => {
  expect(redactedOrderFields("t", { paymentLink: { note: "For Robin's wedding" } })["paymentLink.note"]).toBe("");
  expect("paymentLink.note" in redactedOrderFields("t", { orderNote: "x" })).toBe(false);
  expect("paymentLink.note" in redactedOrderFields("t")).toBe(false);
});
