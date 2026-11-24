// The sample photos a starter fills its empty picture spots with (plan "Rethinking starter websites and Studio", step 2):
// the shop's sample set (starterSamples.ts) and, per section type, its main picture field from the section's own Studio
// fields. Phone-only and extra pictures (mobile image, floating cover) stay empty, so they fall back to the main one.

import { getSectionFields } from "../ThemeEditorExtensions";
import { samplePhotosFor } from "../starterSamples";
import type { StarterPhotos } from "./presetContent";

const MAIN_PICTURE = new Set(["imageUrl"]);

/** A section type's main picture fields. */
export function mainPictureKeys(type: string): string[] {
  return getSectionFields(type).filter((f) => f.kind === "image" && MAIN_PICTURE.has(f.key)).map((f) => f.key);
}

/** What applyStarter / applyPresetSections need to fill a starter's pictures for a shop that sells `sells`. */
export function starterPhotos(sells?: string | null, base?: string): StarterPhotos {
  return { photos: samplePhotosFor(sells, base), imageKeys: mainPictureKeys };
}
