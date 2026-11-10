// The shared system (LMB-PLATFORM docs/shared-system.md): index.js loads with the shop folders on, as deployed, and
// every database trigger listens inside the shop folders. A load-time read of a fixed address would throw here
// (shopScope.js refuses the database outside a shop), so a new module-level `db.collection(...)` fails this test.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname: on Windows the pathname is "/D:/..." and the child fails to start.
const here = path.dirname(fileURLToPath(import.meta.url));

describe("index.js in the shared system", () => {
  it("loads with the folders on, and every trigger listens on shops/{shopId}/...", () => {
    const env = { ...process.env };
    delete env.SHOP_FOLDERS;
    const script = `
      const m = require("./index.js");
      const out = {};
      for (const [name, fn] of Object.entries(m)) {
        const e = fn && fn.__endpoint;
        if (e && e.eventTrigger) out[name] = (e.eventTrigger.eventFilterPathPatterns || {}).document || "";
      }
      process.stdout.write(JSON.stringify(out));`;
    const out = JSON.parse(execFileSync(process.execPath, ["-e", script], { cwd: here, env, encoding: "utf8", timeout: 60000 }));
    expect(Object.keys(out).length).toBeGreaterThan(10);
    for (const [name, document] of Object.entries(out)) {
      expect(document, name).toMatch(/^shops\/\{shopId\}\/[a-zA-Z-]+\//);
    }
  }, 70000);
});
