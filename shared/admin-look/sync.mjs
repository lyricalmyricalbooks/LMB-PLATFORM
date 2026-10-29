// Copies the admin look from this folder (the one source) into both apps, or checks the copies still match it.
//   node shared/admin-look/sync.mjs          write the copies
//   node shared/admin-look/sync.mjs --check  fail if a copy differs (shared/admin-look/admin-look.test.js runs this)
// Never edit a copy: the shop and the stockroom build from the copies, and this script overwrites them.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/** source file -> where each app keeps its copy */
export const COPIES = [
  { from: "adminThemes.css", to: ["apps/shop/src/app/admin/riso/adminThemes.css", "apps/stockroom/src/styles/admin-look/adminThemes.css"] },
  { from: "pressroom.css", to: ["apps/shop/src/app/admin/riso/riso.css", "apps/stockroom/src/styles/admin-look/pressroom.css"] },
];

const banner = (from) =>
  `/* GENERATED from shared/admin-look/${from} by shared/admin-look/sync.mjs. Edit the source, never this copy. */\n`;

export function expected(from) {
  return banner(from) + readFileSync(resolve(here, from), "utf8");
}

/** The copies that are missing or differ from their source. */
export function stale() {
  const out = [];
  for (const { from, to } of COPIES) {
    for (const t of to) {
      const file = resolve(root, t);
      if (!existsSync(file) || readFileSync(file, "utf8") !== expected(from)) out.push(t);
    }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(`Out of date (run node shared/admin-look/sync.mjs): ${bad.join(", ")}`); process.exit(1); }
    console.log("Admin look copies match the source.");
  } else {
    for (const { from, to } of COPIES) for (const t of to) {
      const file = resolve(root, t);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, expected(from));
    }
    console.log("Admin look copied into the shop and the stockroom.");
  }
}
