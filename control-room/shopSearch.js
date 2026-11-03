// The Shops list's search (code plan 9.3, tags 19.13), shared by the page (app.js) and its tests. Plain browser
// JavaScript with no imports, so the page can load it as it is.

/** True when every word typed is found in the press's name, shop id, owner email or one of its tags. */
export function shopMatches(shop, typed, tags = []) {
  const words = String(typed ?? "").trim().toLowerCase();
  if (!words) return true;
  const fields = [shop?.pressName, shop?.shopId, shop?.ownerEmail, ...(tags ?? [])].map((v) => String(v ?? "").toLowerCase());
  return fields.some((field) => field.includes(words)) || words.split(/\s+/).every((word) => fields.some((field) => field.includes(word)));
}
