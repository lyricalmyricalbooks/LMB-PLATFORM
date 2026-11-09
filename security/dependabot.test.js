import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";

test("weekly update requests cover every folder that has packages, and the actions", () => {
  const config = readFileSync(".github/dependabot.yml", "utf8");
  const listed = new Set([...config.matchAll(/package-ecosystem:\s*(\S+)\s+directory:\s*(\S+)/g)].map((m) => `${m[1]} ${m[2]}`));
  const folders = execFileSync("git", ["ls-files", "*package.json"]).toString().split("\n").filter(Boolean)
    .map((file) => (dirname(file) === "." ? "/" : `/${dirname(file)}`));
  assert.ok(folders.length >= 4, "the package folders were found");
  for (const folder of folders) assert.ok(listed.has(`npm ${folder}`), `${folder} has no weekly update request`);
  assert.ok(listed.has("github-actions /"));
  assert.equal([...config.matchAll(/interval:\s*weekly/g)].length, listed.size);
  // A new release waits a week before it is offered, so a poisoned release is usually pulled before it reaches us.
  assert.equal([...config.matchAll(/cooldown:\s*\{\s*default-days:\s*7\s*\}/g)].length, listed.size, "every update request has the week's cooldown");
});
