// Books › Import › "From your old shop's address" (plan 23.11): the admin types the old shop's web address and this
// reads the products it shows the public, answering them as a product file the browser previews like a chosen one.
// Nothing is saved here. The reader is moving/oldShop.mjs, a copy of the platform's services/moving/oldShop.js (the
// same one setup uses), with its careful fetch: public https names only, pinned to the checked address, redirects
// checked hop by hop, 15 seconds and 5 MB at most. Admin only, and a few reads per ten minutes.
"use strict";

/** { status, body } for one read: the address checked, the rate limit, then `read(address)` and the answer's `fields`. */
async function oneRead(body, { allow, read }, fields, fallback) {
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  if (!address) return { status: 400, body: { error: "Type your old shop's web address, like yourshop.com." } };
  if (!(await allow())) return { status: 429, body: { error: "That's a lot of reads in a short time. Wait a few minutes and try again." } };
  const answer = await read(address, body);
  if (!answer?.ok) return { status: 400, body: { error: answer?.message || fallback } };
  return { status: 200, body: Object.fromEntries(fields.map((f) => [f, answer[f]])) };
}

/** Books › Import: `read(address)` is the copied readOldShop; `allow()` the rate limit. */
const handleOldShopRead = (body, deps) => oneRead(body, deps, ["host", "csv", "products", "notes"], "We couldn't read the products at that address.");

/**
 * Settings › General › Check your old links (plan 23.8): the old shop's page addresses from its public site map
 * (moving/oldLinks.mjs, a copy of services/moving/oldLinks.js). Shares the old-shop rate limit.
 */
const handleOldLinksRead = (body, deps) => oneRead(body, deps, ["host", "paths", "notes"], "We couldn't read your old shop's pages.");

/**
 * Settings › General › URL redirects › Bring pages over (plan 23.6): the old shop's own pages at `paths` (from the
 * old-link check), each rebuilt with an allow-list (moving/oldPages.mjs, a copy of services/moving/oldPages.js) for the
 * admin to save as drafts. Shares the old-shop rate limit.
 */
const handleOldPagesRead = (body, deps) => {
  if (!Array.isArray(body?.paths) || !body.paths.length || body.paths.length > 50 || !body.paths.every((p) => typeof p === "string" && p.length <= 500)) {
    return Promise.resolve({ status: 400, body: { error: "Choose which old pages to bring over." } });
  }
  return oneRead(body, deps, ["host", "pages", "skipped"], "We couldn't read your old shop's pages.");
};

/** The copied readers, loaded on first use (the server is CommonJS; the copies are ES modules). */
const readOldShop = async (address) => (await import("./moving/oldShop.mjs")).readOldShop(address);
const readOldLinks = async (address) => (await import("./moving/oldLinks.mjs")).readOldLinks(address);
const readOldPages = async (address, body) => (await import("./moving/oldPages.mjs")).readOldPages(address, body?.paths);

module.exports = { handleOldShopRead, handleOldLinksRead, handleOldPagesRead, readOldShop, readOldLinks, readOldPages };
