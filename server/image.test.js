// The server's image holds everything the server imports, and nothing installed: every file reachable from
// server/main.js is in a folder the Dockerfile copies and Cloud Build uploads, and none of them imports a package.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function closure(entry) {
  const files = new Set();
  const packages = new Set();
  const walk = (file) => {
    if (files.has(file)) return;
    files.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith("node:")) continue;
      if (!spec.startsWith(".")) {
        packages.add(`${relative(ROOT, file)}: ${spec}`);
        continue;
      }
      const target = resolve(dirname(file), spec);
      assert.ok(existsSync(target), `${relative(ROOT, file)} imports ${spec}, which isn't there`);
      if (/\.m?js$/.test(target)) walk(target);
    }
  };
  walk(resolve(ROOT, entry));
  // Forward slashes on every system (Windows gives back-slashes), so the folder check reads the same everywhere.
  return { files: [...files].map((f) => relative(ROOT, f).split(sep).join("/")), packages: [...packages] };
}

const dockerFolders = () => [...readFileSync(resolve(ROOT, "server/Dockerfile"), "utf8").matchAll(/^COPY (\S+) \.\/\1$/gm)].map((m) => m[1]).sort();
const uploadFolders = () => [...readFileSync(resolve(ROOT, "server/.gcloudignore"), "utf8").matchAll(/^!\/([^/\s]+)\/$/gm)].map((m) => m[1]).sort();

test("every file the server imports is in the image, and the server needs no package", () => {
  const { files, packages } = closure("server/main.js");
  assert.ok(files.length > 50, `only ${files.length} files`);
  assert.deepEqual(packages, [], "the server imports packages; it must run on Node alone");
  const folders = new Set(dockerFolders());
  assert.deepEqual(files.filter((file) => !folders.has(file.split("/")[0])), [], "files the Dockerfile doesn't copy");
  assert.ok(!files.some((file) => file.startsWith("apps/")), "the server never imports the shop or stockroom copies");
});

test("the Dockerfile copies what Cloud Build uploads, and runs the server on Node 22", () => {
  assert.deepEqual(dockerFolders(), uploadFolders());
  const dockerfile = readFileSync(resolve(ROOT, "server/Dockerfile"), "utf8");
  assert.match(dockerfile, /^FROM node:22-slim$/m);
  assert.match(dockerfile, /^COPY package\.json \.\/$/m);
  assert.match(dockerfile, /^USER node$/m);
  assert.match(dockerfile, /^CMD \["node", "server\/main\.js"\]$/m);
  assert.doesNotMatch(dockerfile, /npm (install|ci)/, "nothing is installed");
  // A file the server reads at start (the profile's schema) travels with its folder.
  assert.ok(existsSync(resolve(ROOT, "profile/shop-profile.schema.json")));
});
