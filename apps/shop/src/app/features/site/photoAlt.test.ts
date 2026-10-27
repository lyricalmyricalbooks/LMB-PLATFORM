import { describe, expect, it } from "vitest";
import { describedAlt, looksLikeFileName } from "./photoAlt";

describe("describedAlt", () => {
  it("drops file names imported as alt text", () => {
    for (const name of ["01", "IMG_9564", "preview_DL01130214", "giuste3", "libro (1) (1)", "DSC0042.jpg", "cover", "  "]) {
      expect(describedAlt(name)).toBe("");
    }
  });
  it("keeps real descriptions, short or long", () => {
    expect(describedAlt(" The Hound by Ian Willms, front cover ")).toBe("The Hound by Ian Willms, front cover");
    expect(describedAlt("Open spread of Greyhound bus photographs")).toBe("Open spread of Greyhound bus photographs");
    expect(looksLikeFileName("Back cover.jpg")).toBe(true);
    expect(looksLikeFileName("Back cover")).toBe(false);
  });
});
