import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SoldOutBadge, SoldOutVeil, soldOutFade, soldOutLook, soldOutPhotoStyle } from "./SoldOutBadge";

describe("sold-out badge", () => {
  it("defaults to the corner tag and falls back from unknown looks", () => {
    expect(soldOutLook({})).toBe("tag");
    expect(soldOutLook({ soldOutBadgeStyle: "nope" })).toBe("tag");
    expect(soldOutLook({ soldOutBadgeStyle: "stamp" })).toBe("stamp");
  });

  it("uses each look's own fade unless Studio sets one, clamped to 0–90 %", () => {
    expect(soldOutFade({})).toBeCloseTo(0.35);
    expect(soldOutFade({ soldOutBadgeStyle: "classic" })).toBe(0);
    expect(soldOutFade({ soldOutPhotoFade: 0 })).toBe(0);
    expect(soldOutFade({ soldOutPhotoFade: 200 })).toBeCloseTo(0.9);
    expect(soldOutPhotoStyle({ soldOutPhotoFade: 0 })).toEqual({});
    expect(renderToStaticMarkup(<SoldOutVeil design={{ soldOutPhotoFade: 0 }} />)).toBe("");
  });

  it("renders the shop's words with Studio colours, size and corner", () => {
    for (const look of ["tag", "stamp", "band", "classic"]) {
      const html = renderToStaticMarkup(
        <SoldOutBadge design={{ soldOutBadgeStyle: look, soldOutBadgeBg: "#123456", soldOutBadgeText: "#abcdef", soldOutBadgeSize: 20, soldOutBadgePosition: "bottom-right" }} label="Gone" />,
      );
      expect(html).toContain("Gone");
      expect(html).toContain("#abcdef");
      expect(html).toContain("font-size:20px");
      expect(html).toContain('data-studio-target="style:products"');
      if (look === "tag" || look === "classic") expect(html).toMatch(/bottom:0.*right:0|right:0.*bottom:0/);
    }
  });
});
