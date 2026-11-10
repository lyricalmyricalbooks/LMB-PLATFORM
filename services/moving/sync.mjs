// Copies the old-shop reader (oldShop.js, the site-map reader oldLinks.js, the page reader oldPages.js, the product-page reader productPages.js and the careful fetch they use) into the shop's server, where an open shop's
// Books › Import reads an old shop's address too (plan 23.11), or checks the copies still match.
//   node services/moving/sync.mjs          write the copies
//   node services/moving/sync.mjs --check  fail if a copy differs (sync.test.js runs this)
// The shop's server is CommonJS, so the copies are .mjs files it loads with import(). Never edit a copy.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

export const COPIES = [
  { from: "safeFetch.js", to: "apps/shop/functions/moving/safeFetch.mjs" },
  { from: "oldShop.js", to: "apps/shop/functions/moving/oldShop.mjs" },
  { from: "oldLinks.js", to: "apps/shop/functions/moving/oldLinks.mjs" },
  { from: "oldPages.js", to: "apps/shop/functions/moving/oldPages.mjs" },
  { from: "productPages.js", to: "apps/shop/functions/moving/productPages.mjs" },
];

export function expected(from) {
  const banner = `// GENERATED from services/moving/${from} by services/moving/sync.mjs. Edit the source, never this copy.\n`;
  return banner + readFileSync(resolve(here, from), "utf8").replace(/from "\.\/(safeFetch|oldShop|oldLinks|productPages)\.js"/g, 'from "./$1.mjs"');
}

/** The copies that are missing or differ from their source. */
export function stale() {
  return COPIES.filter(({ from, to }) => { const file = resolve(root, to); return !existsSync(file) || readFileSync(file, "utf8") !== expected(from); }).map(({ to }) => to);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(`Out of date (run node services/moving/sync.mjs): ${bad.join(", ")}`); process.exit(1); }
    console.log("Old-shop reader copies match the source.");
  } else {
    for (const { from, to } of COPIES) { const file = resolve(root, to); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, expected(from)); }
    console.log("Old-shop reader copies written.");
  }
}
