import { describe, expect, it } from "vitest";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { libraryLook, STARTER_SITES } from "../lookGallery";
import { applyStarter } from "./starterDesign";
import { mainPictureKeys, starterPhotos } from "./starterPhotos";

describe("starters arrive with the shop's sample photos", () => {
  it("knows each section's main picture field", () => {
    expect(mainPictureKeys("ImageWithTextSection")).toEqual(["imageUrl"]);
    expect(mainPictureKeys("NewsletterSection")).not.toContain("mobileImageUrl");
  });
  it("fills every whole-website starter's empty pictures for a clothing shop, and keeps photos a starter brings", () => {
    for (const id of STARTER_SITES) {
      const theme = libraryLook(id);
      const plain = JSON.stringify(applyStarter({}, theme, getSectionMeta));
      const filled = JSON.stringify(applyStarter({}, theme, getSectionMeta, (t) => t, starterPhotos("clothing", "/")));
      for (const own of plain.match(/\/starters\/[^"]+/g) || []) expect(filled, id).toContain(own);
      expect(filled.includes("/samples/") || !/"imageUrl":""/.test(plain), id).toBe(true);
      expect(filled, id).not.toMatch(/\/samples\/(?!clothing\/)/);
    }
  });
});
