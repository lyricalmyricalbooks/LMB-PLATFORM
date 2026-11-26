import { publicApi } from "../../lib/publicApi";
import { currentStorefrontData, fetchStorefrontDataFile, shippingProfilesFrom } from "./storefrontDataFile";

// Shipping rules are read once per visit (public collection), by the bag the first time it opens and by book
// pages for their search listing. They come from the catalog file on Hosting while it is current (the same check
// the shop's data makes, shared with it), else from Firestore. A failed read is forgotten so the next caller tries again.
let shippingProfilesLoad: Promise<any[] | null> | null = null;

/**
 * A preview that brings its own shipping rules (the live demo shops' sample "free over" rule) uses them and reads nothing,
 * so a sample shop's bag shows the free-shipping bar a finished shop has.
 */
function previewShippingProfiles(): any[] | null {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("preview") !== "true") return null;
  const own = (window as any).__studioPreviewState?.shippingProfiles;
  return Array.isArray(own) ? own : null;
}

export async function readShippingProfiles(): Promise<any[]> {
  const preview = previewShippingProfiles();
  if (preview) return preview;
  const fromFile = shippingProfilesFrom(await currentStorefrontData(fetchStorefrontDataFile, publicApi.getCatalogVersion));
  return fromFile || publicApi.getShippingProfiles();
}

export const loadShippingProfiles = () => (shippingProfilesLoad ||= readShippingProfiles().catch(() => { shippingProfilesLoad = null; return null; }));
