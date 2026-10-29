// The platform's one web site (lmb-platform-prod): every platform page in the folder layout their links expect
// (/waitlist/, /signup/, /account/, /help/, /status/, /terms/, /experts/, /control-room/), built into `site/dist`.
// Only the files a page loads in the browser are copied, found by following its scripts, styles and imports, so no
// server code, test or note is ever published. The waitlist is also the home page, and the account page is served at
// both /accounts/ (its scripts' own folder) and /account/ (where the other pages and the billing emails link).
//   node site/build.js            builds site/dist, or explains what is wrong and exits 1
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUT = join(ROOT, "site", "dist");

/** Each page, by its file in the repo. */
export const PAGES = [
  "waitlist/index.html",
  "signup/index.html",
  "accounts/index.html",
  "accounts/billing.html",
  "help/index.html",
  "terms/index.html",
  "status/index.html",
  "experts/index.html",
  "control-room/index.html",
];

/** Folders published at a second address as well: [repo folder, address folder] ("" is the home page). */
export const ALSO_AT = [["waitlist", ""], ["accounts", "account"]];

const toPosix = (path) => path.split(sep).join("/");
const external = (ref) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);

/** The local files one file refers to: [{ ref, kind }], kind "load" (must exist) or "link" (another page). */
export function references(file, text) {
  const refs = [];
  if (file.endsWith(".html")) {
    for (const [, ref] of text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) refs.push({ ref, kind: "load" });
    for (const [tag, ref] of text.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/g)) {
      refs.push({ ref, kind: /rel="(?:stylesheet|icon|modulepreload|manifest)"/.test(tag) ? "load" : "link" });
    }
    for (const [, ref] of text.matchAll(/<(?:a|form)\b[^>]*\b(?:href|action)="([^"]+)"/g)) refs.push({ ref, kind: "link" });
    for (const [, ref] of text.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) refs.push({ ref, kind: "load" });
  }
  if (/\.(?:html|js|mjs)$/.test(file)) {
    const imports = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;
    for (const match of text.matchAll(imports)) refs.push({ ref: match[1] || match[2] || match[3], kind: "import" });
  }
  if (file.endsWith(".css")) {
    for (const [, ref] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.push({ ref, kind: "load" });
    for (const [, ref] of text.matchAll(/@import\s+["']([^"']+)["']/g)) refs.push({ ref, kind: "load" });
  }
  return refs;
}

/**
 * Every file the pages load, as repo-relative paths, and the problems found: a missing file, or a browser file that
 * imports something only Node has (a bare package name or `node:`). Absolute links ("/terms/") are other pages.
 */
export function collect(root = ROOT, pages = PAGES) {
  const files = new Set();
  const problems = [];
  const visit = (path) => {
    const rel = toPosix(relative(root, path));
    if (files.has(rel)) return;
    if (rel.startsWith("..") || !existsSync(path)) return problems.push(`${rel} is missing`);
    files.add(rel);
    const text = readFileSync(path, "utf8");
    for (const { ref, kind } of references(rel, text)) {
      const clean = ref.replace(/[?#].*$/, "");
      if (kind === "import" && !/^(?:\.|\/|https:)/.test(clean)) {
        problems.push(`${rel} imports "${ref}", which only exists on a server`);
        continue;
      }
      if (external(ref)) continue;
      // Links to other pages are checked by the pages' own tests, not loaded here. A file loaded by an absolute
      // address ("/accounts/billing.js") is at that path in the repo, since the site keeps the repo's folders.
      if (kind === "link" || clean.endsWith("/")) continue;
      visit(clean.startsWith("/") ? join(root, clean) : normalize(join(dirname(path), clean)));
    }
  };
  for (const page of pages) visit(join(root, page));
  return { files: [...files].sort(), problems };
}

/** Copies the files into `out` at their own paths, and the ALSO_AT folders at their second address. */
export function build({ root = ROOT, out = OUT, pages = PAGES, alsoAt = ALSO_AT } = {}) {
  const { files, problems } = collect(root, pages);
  if (problems.length) return { files, problems };
  rmSync(out, { recursive: true, force: true });
  const copy = (from, to) => {
    mkdirSync(dirname(join(out, to)), { recursive: true });
    cpSync(join(root, from), join(out, to));
  };
  for (const file of files) {
    copy(file, file);
    for (const [folder, address] of alsoAt) {
      if (file.startsWith(`${folder}/`)) copy(file, (address ? `${address}/` : "") + file.slice(folder.length + 1));
    }
  }
  return { files, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, problems } = build();
  if (problems.length) {
    console.error(`The platform site was not built:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`Built ${files.length} files for ${PAGES.length} pages into ${toPosix(relative(ROOT, OUT))}.`);
}
