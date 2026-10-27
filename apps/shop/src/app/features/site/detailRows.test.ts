import { describe, expect, it } from "vitest";
import { editorDetailRows, shownDetailRows } from "./detailRows";

const book = { edition: "First edition", pageCount: 192, publisher: "LM", format: "Hardcover", isbn: "978", language: "English" };
const label = (k: string) => k.replace("spec", "");

describe("book page detail rows", () => {
  it("keeps the original order when nothing is saved", () => {
    expect(shownDetailRows(book, label).map((r) => r.key)).toEqual(["specEdition", "specPages", "specPublisher", "specFormat", "specLanguage", "specIsbn"]);
  });
  it("follows the saved order, overrides and hides rows, and adds own rows", () => {
    const rows = shownDetailRows({ ...book, detailRows: [
      { key: "specFormat", value: "Hardcover, raw book board with silk screening" },
      { key: "custom:a", label: "Paper", value: "Mohawk" },
      { key: "specPages", label: "Page count" },
      { key: "specEdition", hidden: true },
    ] }, label);
    expect(rows.slice(0, 3)).toEqual([
      { key: "specFormat", label: "Format", value: "Hardcover, raw book board with silk screening", builtin: true },
      { key: "custom:a", label: "Paper", value: "Mohawk", builtin: false },
      { key: "specPages", label: "Page count", value: "192", builtin: true },
    ]);
    expect(rows.find((r) => r.key === "specEdition")).toBeUndefined();
    expect(rows.map((r) => r.key)).toContain("specIsbn"); // built-ins not in the saved list still show, after it
  });
  it("brings older extra rows into the list", () => {
    expect(editorDetailRows({ extraDetails: [{ label: "Paper", value: "Mohawk" }] }).at(-1)).toMatchObject({ label: "Paper", value: "Mohawk" });
    expect(shownDetailRows({ extraDetails: [{ label: "Paper", value: "Mohawk" }] }, label)).toEqual([{ key: "custom:1", label: "Paper", value: "Mohawk", builtin: false }]);
  });
  it("respects Studio's Show edition details switch and the chosen edition", () => {
    expect(shownDetailRows(book, label, { showEditionFacts: false }).map((r) => r.key)).not.toContain("specEdition");
    expect(shownDetailRows(book, label, { edition: "Signed" })[0].value).toBe("Signed");
  });
});
