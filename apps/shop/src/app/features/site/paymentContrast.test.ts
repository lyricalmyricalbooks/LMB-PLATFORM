import { expect, it } from "vitest";
import { readablePaymentText } from "./paymentContrast";

it("repairs the live white field with inherited white text", () => {
  expect(readablePaymentText("rgb(255, 255, 255)", "rgb(255, 255, 255)")).toBe("#000000");
});
it("protects dark fields and preserves readable Studio colours", () => {
  expect(readablePaymentText("rgb(17, 17, 17)", "rgb(17, 17, 17)")).toBe("#ffffff");
  expect(readablePaymentText("rgb(255, 255, 255)", "rgb(30, 40, 50)")).toBe("rgb(30, 40, 50)");
  expect(readablePaymentText("rgb(17, 17, 17)", "rgb(255, 255, 255)")).toBe("rgb(255, 255, 255)");
});
