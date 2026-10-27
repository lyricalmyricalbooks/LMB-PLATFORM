import { publicApi } from "../../lib/publicApi";
import { currentStorefrontData, fetchStorefrontDataFile, shippingProfilesFrom } from "./storefrontDataFile";

// Shipping rules are read once per visit (public collection), by the bag the first time it opens and by book
// pages for their search listing. They come from the catalog file on Hosting while it is current (the same check
// the shop's data makes, shared with it), else from Firestore. A failed read is forgotten so the next caller tries again.
let shippingProfilesLoad: Promise<any[] | null> | null = null;

export async function readShippingProfiles(): Promise<any[]> {
  const fromFile = shippingProfilesFrom(await currentStorefrontData(fetchStorefrontDataFile, publicApi.getCatalogVersion));
  return fromFile || publicApi.getShippingProfiles();
}

export const loadShippingProfiles = () => (shippingProfilesLoad ||= readShippingProfiles().catch(() => { shippingProfilesLoad = null; return null; }));
