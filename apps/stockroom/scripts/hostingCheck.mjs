// Checks a stockroom build against its Hosting settings (plan 1.20): `npm run build && npm run check:hosting`.
//   - Hosting serves the folder the build writes (`dist`), and it holds the page, the service worker and /shop-profile.js.
//   - Files that keep their name between releases (the page, the service worker, the profile…) are never cached,
//     so a release reaches every device on its next visit and a shop's profile change is seen at once.
//   - Everything cached for a year sits under /assets/ and carries a content hash in its name.
// CI runs it after the build (job `stockroom`).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MUST_EXIST = ["index.html", "sw.js", "shop-profile.js", "manifest.webmanifest"];
// Names a release can change without renaming: never cached.
const ALWAYS_FRESH = /(?:^|\/)index\.html$|^(?:sw|sw-notify|registerSW)\.js$|^manifest\.webmanifest$|^shop-profile\.js$|^gas-code\.txt$/;
const HASHED = /[-.][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/** The Cache-Control value Hosting sends for a path, from the config's header rules (the last match wins). */
export function cacheControlFor(hosting, path) {
  let value = "";
  for (const rule of hosting.headers ?? []) {
    if (!new RegExp(rule.regex).test(path)) continue;
    for (const h of rule.headers) if (h.key.toLowerCase() === "cache-control") value = h.value;
  }
  return value;
}

/** Problems with serving `files` (paths relative to the build folder, "/" separated) under `hosting`, in plain words. */
export function hostingProblems(hosting, files) {
  const problems = [];
  if (hosting.public !== "dist") problems.push(`Hosting serves "${hosting.public}", not the build folder "dist"`);
  for (const file of MUST_EXIST) if (!files.includes(file)) problems.push(`the build has no ${file}`);
  for (const file of files) {
    const url = `/${file}`;
    const cache = cacheControlFor(hosting, url);
    if (ALWAYS_FRESH.test(file) && cache !== "no-cache") problems.push(`${url} must be sent with no-cache, not "${cache || "the default"}"`);
    if (/immutable/.test(cache) && !(file.startsWith("assets/") && HASHED.test(file))) problems.push(`${url} is cached for good but its name has no content hash`);
  }
  // Directory addresses get their index.html; they must not be cached either.
  for (const file of files.filter((f) => f.endsWith("index.html"))) {
    const dir = `/${file.slice(0, -"index.html".length)}`;
    if (cacheControlFor(hosting, dir) !== "no-cache") problems.push(`${dir} must be sent with no-cache`);
  }
  return problems;
}

/** Every file under `dir`, relative and "/" separated. */
export function listFiles(dir) {
  const out = [];
  const walk = (at) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { hosting } = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8"));
  let files;
  try {
    files = listFiles(join(root, hosting.public));
  } catch {
    console.error(`No build in ${hosting.public}/: run npm run build first.`);
    process.exit(1);
  }
  const problems = hostingProblems(hosting, files);
  for (const p of problems) console.error(`- ${p}`);
  console.log(problems.length ? `${problems.length} hosting problem(s).` : `Hosting settings fit the build (${files.length} files).`);
  process.exit(problems.length ? 1 : 0);
}
