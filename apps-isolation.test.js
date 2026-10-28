// The app copies in apps/ must never be able to reach Lyricalmyrical's live shop or stockroom: no live project id, web
// key or app id anywhere in them, and no Firebase project file that would make a deploy pick a project by default.
// Julian's own repos (LyricalmyricalWebsite, lyrical-inventory) are separate and are never changed for the platform.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Built from parts so this file doesn't trip its own check.
const LIVE = [
  ["lyricalmyrical", "web-v2"].join("-"),
  ["lyricalmyrical", "37c46"].join("-"),
  "AIzaSyB9V866" + "zhYfSoXplpzK1oaK7dTuXV7yDxA",
  "AIzaSyB0BTOj" + "fUFZKCVth9eR8iN0mvfkpRIFKSI",
  "2488945" + "89273",
  "4487198" + "24639",
];
const SKIP = new Set(["node_modules", "dist", ".git", ".firebase"]);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

test("both app copies are here", () => {
  assert.ok(existsSync("apps/shop/package.json"));
  assert.ok(existsSync("apps/stockroom/package.json"));
});

test("no app copy names a live Lyricalmyrical project or key", () => {
  const hits = [];
  for (const path of files("apps")) {
    const text = readFileSync(path, "latin1");
    for (const id of LIVE) if (text.includes(id)) hits.push(`${path}: ${id}`);
  }
  assert.deepEqual(hits, []);
});

test("no app copy has a default Firebase project", () => {
  const found = [...files("apps")].filter((path) => path.endsWith(".firebaserc"));
  assert.deepEqual(found, []);
});

// Nothing here may publish a site: no custom-domain file (GitHub Pages would claim that address) and no workflow in
// the root folder, the only one GitHub runs, that deploys.
test("no app copy claims a web address", () => {
  const found = [...files("apps")].filter((path) => path.endsWith("/CNAME"));
  assert.deepEqual(found, []);
});

test("no workflow deploys anything", () => {
  const dir = ".github/workflows";
  const deploys = readdirSync(dir).filter((name) =>
    /firebase\s+deploy|deploy-pages|FirebaseExtended\/action-hosting-deploy|peaceiris\/actions-gh-pages/i.test(readFileSync(join(dir, name), "utf8")),
  );
  assert.deepEqual(deploys, []);
});

// The copies are a general shop and stockroom for any press: nothing in them may name Lyricalmyrical, send people to
// its web address, mail its inbox or point Google at its site. The only allowed mention is this repository's own
// GitHub address (the organisation is still called lyricalmyricalbooks), and apps/README.md, which records where the
// copies came from.
test("no app copy names Lyricalmyrical, its address or its email", () => {
  const ALLOWED = /lyricalmyricalbooks\/LMB-PLATFORM/gi;
  const hits = [];
  for (const path of files("apps")) {
    if (path === join("apps", "README.md")) continue;
    const text = readFileSync(path, "latin1").replace(ALLOWED, "");
    const match = text.match(/lyricalmyrical|lyrical-inventory/i);
    if (match) hits.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(hits, []);
});

// Plan 1.18: the same protection for everything else in this repository, outside shops/ (the only place a real
// press's own values may ever live). The build fails when code names a live Lyricalmyrical project or key, names
// Lyricalmyrical at all, holds a real person's or business's email address, or names a Firebase project that isn't
// the test shop's, the platform's own or a made-up one. Files git would add are checked too, before they're committed.
const repoFiles = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\0")
  .filter((path) => path && !path.startsWith("shops/") && existsSync(path) && statSync(path).isFile());
const textOf = (path) => {
  const bytes = readFileSync(path);
  return bytes.subarray(0, 8000).includes(0) ? null : bytes.toString("latin1");
};
const TEXT = repoFiles.map((path) => [path, textOf(path)]).filter(([, text]) => text !== null);
// Markdown is prose about the rules (it may say "never touch Lyricalmyrical"); only its code blocks are code.
const codeOf = (path, text) =>
  /\.md$/i.test(path) ? [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1]).join("\n") : text;
// This repository's own GitHub address: the organisation is still called lyricalmyricalbooks.
const OWN_REPO = /lyricalmyricalbooks\/LMB-PLATFORM/gi;
const LOCKFILES = /(^|\/)(pnpm-lock\.yaml|package-lock\.json)$/;
// The checks themselves have to say the name to look for it (the live ids are still built from parts).
const CHECKERS = new Set(["apps-isolation.test.js", "setup/steps.test.js"]);

test("the check sees the whole repository", () => {
  for (const path of ["setup/steps.js", "waitlist/config.js", "apps/shop/package.json", "apps/stockroom/package.json", "docs/code-plan.md"]) {
    assert.ok(repoFiles.includes(path), `${path} is not checked`);
  }
});

test("nothing outside shops/ names a live Lyricalmyrical project or key", () => {
  const hits = [];
  for (const [path, text] of TEXT) for (const id of LIVE) if (text.includes(id)) hits.push(`${path}: ${id}`);
  assert.deepEqual(hits, []);
});

test("no code outside apps/ and shops/ names Lyricalmyrical", () => {
  const hits = [];
  for (const [path, text] of TEXT) {
    if (path.startsWith("apps/") || CHECKERS.has(path)) continue; // apps/ is checked above, prose included
    const match = codeOf(path, text).replace(OWN_REPO, "").match(/lyricalmyrical|lyrical-inventory/i);
    if (match) hits.push(`${path}: ${match[0]}`);
  }
  assert.deepEqual(hits, []);
});

// Plan 7.3: the short forms too. A file name, label or wordmark starting "Lyrical" or "Myrical" fails outside shops/:
// in apps/ everywhere (prose included, apps/README.md aside), elsewhere in code. Only the stockroom's wire and storage
// ids keep the old word, because renaming them would orphan saved data and every script already deployed, and nobody
// sees them: the Realtime Database folder ('lyrical', lyrical/…, rules.lyrical), the Apps Script service ids
// (lyrical-sheets-webhook-vNN, lyrical-receipt-finder) and quoted browser-storage keys ('lyrical_…').
const SHORT_NAME = /\b(?:lyrical|myrical|lyricamyrical)/i;
const KEPT_IDS = [
  /\blyrical(?=\\?\/)/g,
  /(["'`])lyrical\1/g,
  /\.lyrical\b(?![-_])/g,
  /\blyrical-(?:sheets-webhook|receipt-finder)\b/g,
  /(["'`])lyrical_[a-z0-9_]+\1/g,
];
function shortNameHit(text) {
  const rest = KEPT_IDS.reduce((t, id) => t.replace(id, ""), text.replace(OWN_REPO, ""));
  return rest.match(SHORT_NAME)?.[0] ?? null;
}

test("nothing outside shops/ names one press by its short name (plan 7.3)", () => {
  const hits = [];
  for (const [path, text] of TEXT) {
    if (path === join("apps", "README.md") || CHECKERS.has(path) || LOCKFILES.test(path)) continue;
    const hit = shortNameHit(path.startsWith("apps/") ? text : codeOf(path, text));
    if (hit) hits.push(`${path}: ${hit}`);
  }
  assert.deepEqual(hits, []);
});

test("the short-name check catches a leftover file name and label, and lets the stockroom's own ids through", () => {
  for (const leak of ["downloadCsv(csv, `Lyrical_Tax_Report_${year}.csv`)", "'lyrical-customers.csv'", "<div>Myrical</div>", "title: 'Lyrical Inventory'", "name: 'Lyricamyrical books'"]) {
    assert.ok(shortNameHit(leak), leak);
  }
  for (const kept of [
    "export const DATA_ROOT = 'lyrical';", '"lyrical": {', "ref(db, 'lyrical/settings/catalog')", "rtdbRules.rules.lyrical.settings",
    "service: 'lyrical-sheets-webhook-v59'", "indexedDB.open('lyrical-receipt-finder', 1)", "const KEY = 'lyrical_sync_conflicts_v1';",
    "/lyrical\\/settings\\/(\\w+)/g", "github.com/lyricalmyricalbooks/LMB-PLATFORM", "a lyric poem",
  ]) {
    assert.equal(shortNameHit(kept), null, kept);
  }
});

// The test shop and stockroom, the platform's own project (the waitlist), the emulator's demo-* projects, and the
// made-up presses the tests use. A real press's project id belongs only in shops/.
const PROJECTS = new Set(["lmb-test-shop", "lmb-test-stockroom", "lmb-platform-prod"]);
const MADE_UP_PROJECTS = new Set([
  "moth-press", "moth-press-shop", "shop-mothpress", "press-two", "press-two-shop", "other-press-shop", "not-lmb-test-shop",
  "p", "x", "shop", "other", "example", "id",
]);
function projectAllowed(id) {
  if (!id || /[${}<>]/.test(id) || id.startsWith("demo-")) return true; // empty, or a template slot such as ${projectId}
  if (!/^[a-z0-9-]+$/.test(id)) return true; // not a project id at all (a pattern in code, such as "([^"]+)")
  return PROJECTS.has(id) || MADE_UP_PROJECTS.has(id);
}

// An address passes when nobody can receive mail at it, or when it is a company's own sender that the code recognises
// (receipt finders, mail providers). Anyone else, such as a customer, an artist or a shop the owner works with, must
// be swapped for a placeholder.
const PLACEHOLDER_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost)$|^yourpress\./;
const THROWAWAY_DOMAIN = /^[a-z]\.[a-z]{2,3}$/; // a@x.com, b@y.co: made up by construction
const SENDER_DOMAINS = new Set([
  "bigcartel.com", "email.bigcartel.com", "resend.dev", "stripe.com", "intl.paypal.com", "google.com", "github.com",
  "amazon.ca", "adobe.com", "interac.ca", "freedommobile.ca", "shippo.com", "canadapost.ca", "canadapost.postescanada.ca",
  "anthropic.com", "developer.gserviceaccount.com",
]);
// Stock "type your address here" examples in forms and help text, and the Gmail spellings the code folds together.
const PLACEHOLDER_ADDRESSES = new Set([
  "your@email.com", "you@email.com", "name@email.com", "customer@email.com", "store@email.com", "name@gmail.com",
  "n.ame@gmail.com", "name+2@gmail.com", "n.ame+2@gmail.com", "name+again@gmail.com", "owner@gmail.com", "vip@gmail.com",
  "artist@gmail.com", "someone@else.com", "orders@shop.com", "reader@archive.com", "something@domain.tld",
  "orders@your-domain.com", "hello@yourdomain.com",
]);
// Canada Post's own published API description, kept as downloaded: its examples are theirs.
const VENDORED = new Set(["apps/stockroom/docs/shipping-api-openapi.yaml"]);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const SERVICE_ACCOUNT = ".iam.gserviceaccount.com";

function emailAllowed(address) {
  const lower = address.toLowerCase();
  const domain = lower.slice(lower.indexOf("@") + 1);
  if (PLACEHOLDER_DOMAIN.test(domain) || THROWAWAY_DOMAIN.test(domain)) return true;
  if (domain.endsWith(SERVICE_ACCOUNT)) return projectAllowed(domain.slice(0, -SERVICE_ACCOUNT.length));
  return SENDER_DOMAINS.has(domain) || PLACEHOLDER_ADDRESSES.has(lower);
}

test("every email address outside shops/ is a placeholder or a company's sender", () => {
  const hits = new Set();
  for (const [path, text] of TEXT) {
    if (VENDORED.has(path) || LOCKFILES.test(path)) continue;
    for (const [address] of text.matchAll(EMAIL)) if (!emailAllowed(address)) hits.add(`${path}: ${address}`);
  }
  assert.deepEqual([...hits], []);
});

const REGION_PREFIX = /^[a-z]+-[a-z]+[0-9]{1,2}-/;
const PROJECT_SPOTS = [
  /([A-Za-z0-9${}<>_-]+)\.(?:web\.app|firebaseapp\.com|firebasestorage\.app|appspot\.com)\b/g,
  /([A-Za-z0-9${}<>_-]+)\.cloudfunctions\.net\b/g,
  /projectId["']?\s*[:=]\s*["']([^"']*)["']/g,
  /--project[ =]["']?([A-Za-z0-9${}<>_-]+)/g,
  /GCLOUD_PROJECT=["']?([A-Za-z0-9${}<>_-]+)/g,
];

test("every Firebase project named outside shops/ is the test shop's, the platform's or made up", () => {
  const hits = new Set();
  for (const [path, text] of TEXT) {
    if (LOCKFILES.test(path)) continue;
    for (const spot of PROJECT_SPOTS) {
      for (const [, raw] of text.matchAll(spot)) {
        const id = spot === PROJECT_SPOTS[1] ? raw.replace(REGION_PREFIX, "") : raw;
        // A site name can carry the app after the project: lmb-test-shop-stockroom, ${ID}-stockroom.
        if (!projectAllowed(id) && !projectAllowed(id.replace(/-(shop|stockroom)$/, ""))) hits.add(`${path}: ${id}`);
      }
    }
  }
  assert.deepEqual([...hits], []);
});

test("the check catches each kind of leak", () => {
  assert.equal(emailAllowed("owner@example.com"), true);
  assert.equal(emailAllowed("support@bigcartel.com"), true);
  assert.equal(emailAllowed(["someone", "gmail.com"].join("@")), false);
  assert.equal(emailAllowed(["hello", "realbookshop.com"].join("@")), false);
  assert.equal(emailAllowed(["ci", "real-press-1a2b3.iam.gserviceaccount.com"].join("@")), false);
  assert.equal(projectAllowed("lmb-test-shop"), true);
  assert.equal(projectAllowed("${projectId}"), true);
  assert.equal(projectAllowed(LIVE[0]), false);
  assert.equal(projectAllowed("some-real-press-1a2b3"), false);
});
