import { describe, expect, it } from "vitest";
import { bannerShadeStyle } from "./SectionComponents";

describe("bannerShadeStyle (Image banner › Shade)", () => {
  it("draws the even shade exactly as before when nothing is chosen", () => {
    expect(bannerShadeStyle({})).toEqual({ backgroundColor: "rgb(var(--overlay-rgb, 0, 0, 0))", opacity: 0.4 });
    expect(bannerShadeStyle({ overlayOpacity: 0.7 })).toEqual({ backgroundColor: "rgb(var(--overlay-rgb, 0, 0, 0))", opacity: 0.7 });
  });

  it("fades from the words' own scheme colour, aimed at where the words sit", () => {
    const style = bannerShadeStyle({ overlayStyle: "fade", contentPosition: "bottom-left", overlayOpacity: 0.45 });
    expect(style.backgroundImage).toContain("color-mix(in srgb, var(--bg-color, #000000) 81%, transparent)");
    expect(style.backgroundImage).toContain("0deg");
    expect(style.backgroundColor).toBeUndefined();
  });

  it("falls back to a centred fade for an unknown position and never goes fully solid", () => {
    const style = bannerShadeStyle({ overlayStyle: "fade", contentPosition: "nowhere", overlayOpacity: 1 });
    expect(style.backgroundImage).toContain("radial-gradient");
    expect(style.backgroundImage).toContain("90%");
  });
});
