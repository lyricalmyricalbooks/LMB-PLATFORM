// The Functions run a generated copy of every src/shared rule (scripts/build-shared.mjs, src/shared/CLAUDE.md).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-ignore - plain ESM script
import { checkShared, importProblems, sharedNames } from "./build-shared.mjs";

describe("shared browser/server rules", () => {
  it("the Functions' copies match their sources (run: node scripts/build-shared.mjs)", () => {
    expect(checkShared()).toEqual([]);
  });
  it("a shared file imports only other shared files", () => {
    expect(importProblems("x", 'import { a } from "./other";\nexport { b } from "./b";')).toEqual([]);
    expect(importProblems("x", 'import { a } from "../app/lib/thing";')).toHaveLength(1);
    expect(importProblems("x", 'import type { A } from "react";')).toHaveLength(1);
  });
  it("the Functions load the generated copy, never a hand-written twin", () => {
    for (const name of sharedNames()) {
      const index = readFileSync("functions/index.js", "utf8");
      expect(index.includes(`require("./${name}")`), `functions/index.js requires ./${name}`).toBe(false);
    }
  });
});
