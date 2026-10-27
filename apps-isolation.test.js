// The app copies in apps/ must never be able to reach Lyricalmyrical's live shop or stockroom: no live project id, web
// key or app id anywhere in them, and no Firebase project file that would make a deploy pick a project by default.
// Julian's own repos (LyricalmyricalWebsite, lyrical-inventory) are separate and are never changed for the platform.
import { test } from "node:test";
import assert from "node:assert/strict";
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
