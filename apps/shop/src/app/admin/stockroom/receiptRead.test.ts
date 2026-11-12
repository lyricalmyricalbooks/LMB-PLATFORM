import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { receiptPatch } from "./receiptRead";

const { TASKS, receiptImage } = createRequire(import.meta.url)("../../../../functions/aiWriter.js");

describe("reading a receipt photo", () => {
  test("fills only what the receipt showed", () => {
    expect(receiptPatch({ vendor: "Staples", what: "Printer paper", date: "2026-11-02", total: "42.50", currency: "CAD", number: "R-1", tax: "5.53" }, ["CAD", "USD"]))
      .toEqual({ desc: "Staples: Printer paper", date: "2026-11-02", amount: "42.50", currency: "CAD", ref: "R-1" });
    expect(receiptPatch({ vendor: "", total: "", date: "bad", currency: "XYZ" }, ["CAD"])).toEqual({});
  });
  test("the server cleans the AI's answer and never invents a date", () => {
    expect(TASKS.receiptRead.clean({ vendor: "Staples", what: "Paper", date: "Nov 2", total: "$42.5", tax: "", currency: "cad", number: "" }))
      .toMatchObject({ date: "", total: "42.50", currency: "CAD" });
  });
  test("only a small picture is accepted", () => {
    expect(receiptImage({ imageType: "image/jpeg", imageData: "QUJD" })).toEqual({ mimeType: "image/jpeg", data: "QUJD" });
    expect(receiptImage({ imageType: "text/html", imageData: "QUJD" })).toBeNull();
    expect(receiptImage({ imageType: "image/jpeg", imageData: "A".repeat(10_000_001) })).toBeNull();
  });
});
