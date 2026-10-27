import { describe, expect, it } from "vitest";
import { makeSection, withPageText } from "./studioModel";

describe("withPageText (custom page text becomes movable when sections are added)", () => {
  const collage = makeSection("ImageCollageSection");

  it("adds a Page content section at the end of a custom page's sections, where the fixed text was drawn", () => {
    const next = withPageText([collage], "page:about", { showTitle: true });
    expect(next.map(s => s.type)).toEqual(["ImageCollageSection", "PageContentSection"]);
    expect(next[1].settings).toEqual({ showTitle: true });
    expect(withPageText([], "page", {}).map(s => s.type)).toEqual(["PageContentSection"]);
  });

  it("leaves pages that already have one, and every other page, alone", () => {
    const withText = [makeSection("PageContentSection"), collage];
    expect(withPageText(withText, "page:about")).toBe(withText);
    const home = [collage];
    expect(withPageText(home, "heroPage")).toBe(home);
    expect(withPageText(home, "productPage")).toBe(home);
  });
});
