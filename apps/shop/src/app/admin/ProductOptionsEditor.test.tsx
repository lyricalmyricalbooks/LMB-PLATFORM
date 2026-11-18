import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductOptionsEditor, rowsToOptions, setForOption, toggleSize } from "./ProductOptionsEditor";

const noop = () => {};

describe("product editor options (plan 10.2)", () => {
  it("splits the choices on commas and tidies them", () => {
    expect(rowsToOptions([{ name: " Size ", values: "S, M,, m , L" }, { name: "Colour", values: "" }])).toEqual([{ name: "Size", values: ["S", "M", "L"] }]);
  });
  it("shows nothing to change for a book with plain editions", () => {
    const html = renderToStaticMarkup(<ProductOptionsEditor form={{ variants: [{ id: "hc", name: "Hardcover" }] }} onApply={noop} onClear={noop} />);
    expect(html).toContain("No options");
    expect(html).not.toContain("Make the editions");
  });
  it("lists a saved product's options with their combination count", () => {
    const form = { options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }] };
    const html = renderToStaticMarkup(<ProductOptionsEditor form={form} onApply={noop} onClear={noop} />);
    expect(html).toContain('value="S, M"');
    expect(html).toContain("Update the editions (4)");
    expect(html).toContain("Stop using options");
  });
});

describe("ready-made sizes in Options", () => {
  it("knows which size list a saved option came from", () => {
    expect(setForOption("Size", ["S", "M", "L"])?.id).toBe("letters");
    expect(setForOption("Ring size", ["5", "6.5"])?.id).toBe("rings");
    expect(setForOption("Size", ["Tiny", "M"])).toBeNull();
    expect(setForOption("Colour", ["S"])).toBeNull();
  });

  it("taps a size on in the list's order, and off again", () => {
    const row = { name: "Size", values: "S, L", set: "letters" };
    expect(toggleSize(row, "M").values).toBe("S, M, L");
    expect(toggleSize(row, "XS").values).toBe("XS, S, L");
    expect(toggleSize(row, "L").values).toBe("S");
  });
});
