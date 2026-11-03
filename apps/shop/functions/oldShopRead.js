// Books › Import › "From your old shop's address" (plan 23.11): the admin types the old shop's web address and this
// reads the products it shows the public, answering them as a product file the browser previews like a chosen one.
// Nothing is saved here. The reader is moving/oldShop.mjs, a copy of the platform's services/moving/oldShop.js (the
// same one setup uses), with its careful fetch: public https names only, pinned to the checked address, redirects
// checked hop by hop, 15 seconds and 5 MB at most. Admin only, and a few reads per ten minutes.
"use strict";

/** { status, body } for one read. `read(address)` is the copied readOldShop; `allow()` the rate limit. */
async function handleOldShopRead(body, { allow, read }) {
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!address) return { status: 400, body: { error: "Type your old shop's web address, like yourshop.com." } };
  if (!(await allow())) return { status: 429, body: { error: "That's a lot of reads in a short time. Wait a few minutes and try again." } };
  const answer = await read(address);
  if (!answer?.ok) return { status: 400, body: { error: answer?.message || "We couldn't read the products at that address." } };
  return { status: 200, body: { host: answer.host, csv: answer.csv, products: answer.products, notes: answer.notes } };
}

/** The copied reader, loaded on first use (the server is CommonJS; the copy is an ES module). */
const readOldShop = async (address) => (await import("./moving/oldShop.mjs")).readOldShop(address);

module.exports = { handleOldShopRead, readOldShop };
