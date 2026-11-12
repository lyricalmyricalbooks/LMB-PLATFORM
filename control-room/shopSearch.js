// The Shops list's search (code plan 9.3, tags 19.13), shared by the page (app.js) and its tests. Plain browser
// JavaScript with no imports, so the page can load it as it is.

/**
 * True when every word typed is found in the press's name, shop id, owner email, a web address or one of its tags. A
 * test shop also answers to "book test shop" or "general test shop" (the Shops list and the find bar).
 */
export function shopMatches(shop, typed, tags = []) {
  const words = String(typed ?? "").trim().toLowerCase();
  if (!words) return true;
  const testWords = shop?.testShop === true ? (shop?.sells?.books === false ? "general test shop" : "book test shop") : "";
  const fields = [shop?.pressName, shop?.shopId, shop?.ownerEmail, testWords, ...(shop?.addresses ?? []), ...(tags ?? [])].map((v) => String(v ?? "").toLowerCase());
  return fields.some((field) => field.includes(words)) || words.split(/\s+/).every((word) => fields.some((field) => field.includes(word)));
}
