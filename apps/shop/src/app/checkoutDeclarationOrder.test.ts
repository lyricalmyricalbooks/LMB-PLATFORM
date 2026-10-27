import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression: a hook above `const [settings…] = useState` read `settings` in its
// dependency array, which throws "Cannot access 'settings' before initialization"
// and crashed the whole checkout page.
describe("Checkout component", () => {
  it("never reads settings before it is declared", () => {
    const src = readFileSync(join(__dirname, "Checkout.tsx"), "utf8");
    const body = src.slice(src.indexOf("export function Checkout()"));
    const declared = body.indexOf("const [settings, setSettings]");
    expect(declared).toBeGreaterThan(-1);
    // Comments may describe settings before the declaration; executable reads
    // use optional chaining, which is the TDZ regression this guards against.
    expect(body.slice(0, declared)).not.toMatch(/\bsettings\s*\?\./);
  });
});
