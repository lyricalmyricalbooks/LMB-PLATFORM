// Frame shapes the Crop & edit dialog previews: the same shapes the live shop draws the photo in.
import { aspectRatioValue } from "../features/site/imageAspect";
import { resolveMainDesign, resolveProductDesign } from "../features/site/surfaceDesign";

export type FrameShape = { id: "card" | "page" | "square"; label: string; aspect: string; note: string };

export function shopFrameShapes(design: unknown): FrameShape[] {
  const shop = resolveMainDesign(design, true, false) || {};
  const page = resolveProductDesign(design) || {};
  // MainSite: the reference catalog layout (every layout but Modern) defaults to square cards.
  const cardDefault = shop.catalogLayoutStyle !== "modern" ? "1:1" : "3:4";
  const card = aspectRatioValue(shop.imageAspectRatio || cardDefault);
  const pageShape = aspectRatioValue(page.productImageAspect && page.productImageAspect !== "grid" ? page.productImageAspect : page.imageAspectRatio || "3:4");
  const shapes: FrameShape[] = [
    { id: "card", label: "Shop card", aspect: card, note: "Shop grid, wishlist, sections" },
    { id: "page", label: "Book page", aspect: pageShape, note: "Main photo and thumbnails" },
  ];
  if (card !== "1 / 1" && pageShape !== "1 / 1") shapes.push({ id: "square", label: "Square", aspect: "1 / 1", note: "Square sections" });
  return shapes;
}
