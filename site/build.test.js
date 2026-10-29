import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build, collect, PAGES } from "./build.js";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "site-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test("every platform page builds with no problem, and no test, note or server file is published", () => {
  const { files, problems } = collect();
  assert.deepEqual(problems, []);
  for (const page of PAGES) assert.ok(files.includes(page), page);
  assert.ok(files.includes("accounts/billing.js"), "the billing page's script, loaded by an absolute address");
  for (const file of files) {
    assert.doesNotMatch(file, /\.test\.js$|README\.md$|fakes\.js$|firestore\.rules$/, file);
    assert.match(file, /\.(?:html|js|css)$/, file);
  }
  assert.ok(!files.some((file) => file.startsWith("services/billing/") || file.startsWith("setup/")), "no server code");
});

test("follows scripts, styles, imports and absolute script addresses; skips links and outside addresses", () => {
  const root = repo({
    "a/index.html": '<link rel="stylesheet" href="./look.css"><script type="module" src="./app.js"></script><script src="/b/x.js"></script><a href="../c/">C</a><script src="https://www.gstatic.com/x.js"></script>',
    "a/look.css": "body { background: url('./dot.svg') }",
    "a/dot.svg": "<svg/>",
    "a/app.js": 'import { x } from "../shared/x.js";\nconst later = () => import("./later.js");',
    "a/later.js": "export {};",
    "shared/x.js": "export const x = 1;",
    "b/x.js": "",
    "a/app.test.js": "never published",
  });
  const { files, problems } = collect(root, ["a/index.html"]);
  assert.deepEqual(problems, []);
  assert.deepEqual(files, ["a/app.js", "a/dot.svg", "a/index.html", "a/later.js", "a/look.css", "b/x.js", "shared/x.js"]);
});

test("refuses a missing file and a browser file that imports a server-only package, and writes nothing", () => {
  const root = repo({
    "a/index.html": '<script type="module" src="./app.js"></script><script src="./gone.js"></script>',
    "a/app.js": 'import fs from "node:fs";\nimport x from "stripe";',
  });
  const out = join(root, "dist");
  const { problems } = build({ root, out, pages: ["a/index.html"], alsoAt: [] });
  assert.equal(problems.length, 3);
  assert.match(problems.join("\n"), /a\/gone\.js is missing/);
  assert.match(problems.join("\n"), /"node:fs", which only exists on a server/);
  assert.match(problems.join("\n"), /"stripe", which only exists on a server/);
  assert.equal(existsSync(out), false);
});

test("copies a folder to its second address too: the waitlist is the home page, accounts is also /account/", () => {
  const root = repo({
    "waitlist/index.html": '<script type="module" src="./config.js"></script>',
    "waitlist/config.js": "export const home = 1;",
    "accounts/index.html": '<script type="module" src="./app.js"></script>',
    "accounts/app.js": "",
  });
  const out = join(root, "dist");
  build({ root, out, pages: ["waitlist/index.html", "accounts/index.html"], alsoAt: [["waitlist", ""], ["accounts", "account"]] });
  for (const path of ["index.html", "config.js", "waitlist/index.html", "accounts/app.js", "account/index.html", "account/app.js"]) {
    assert.ok(existsSync(join(out, path)), path);
  }
  assert.equal(readFileSync(join(out, "config.js"), "utf8"), "export const home = 1;");
});
