import { describe, expect, it } from "vitest";
import { fitScale, navFitMin, navLineMode, navLineProps, navLinkStyle } from "./headerNav";

describe("header nav on one line", () => {
  it("defaults to shrink-to-fit", () => {
    expect(navLineMode({})).toBe("fit");
    expect(navLineMode({ navLineMode: "wrap" })).toBe("wrap");
    expect(navLineMode({ navLineMode: "junk" })).toBe("fit");
  });
  it("computes a shrink factor that fits, never below the minimum", () => {
    expect(fitScale(1000, 1200)).toBe(1);
    expect(fitScale(1500, 1200)).toBe(0.8);
    expect(fitScale(3000, 1200, 0.7)).toBe(0.7);
    expect(navFitMin({ navFitMin: 60 })).toBe(0.6);
  });
  it("keeps one line unless wrap is chosen", () => {
    expect(navLineProps({}, true, 0.8).className).toContain("flex-nowrap");
    expect(navLineProps({ navLineMode: "wrap" }, true, 1).className).toContain("flex-wrap");
    expect(navLineProps({}, true, 0.8).style["--nav-fit" as any]).toBe("0.8");
  });
  it("link size and gap scale with the fit factor", () => {
    expect(navLinkStyle({ navLinkSize: 12 }, false).fontSize).toBe("calc(12px * var(--nav-fit, 1))");
    expect(navLineProps({ navGap: 30 }, true, 1).style.columnGap).toBe("calc(30px * var(--nav-fit, 1))");
  });
});

describe("drop-down chevron follows the link size", async () => {
  const { createElement: h } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { StaticRouter } = await import("react-router");
  const { NavDropdown } = await import("./NavDropdown");
  it("never renders a NaN-sized (huge) chevron when the link size is a calc()", () => {
    const html = renderToStaticMarkup(h(StaticRouter, { location: "/" },
      h(NavDropdown, { design: {}, label: "Publications", linkStyle: navLinkStyle({ navLinkSize: 11 }, false), all: { to: "/collections/publications", label: "All" }, entries: [] } as any)));
    expect(html).not.toContain("NaN");
    expect(html).toContain('width="1.2em"');
  });
});
