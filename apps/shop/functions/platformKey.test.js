// The shop's platform key (platformKey.js, plan 2.2) must reach every function on a shop that uses the platform's
// services, and no function on a shop that doesn't (its deploy would otherwise ask for a secret it lacks).
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { usesPlatformServices, withPlatformKey, PLATFORM_SERVICE_KEY } = require("./platformKey.js");
const dir = new URL(".", import.meta.url).pathname;

// Loads the functions as the deploy does and lists, per function, the secrets it declares.
function secretsByFunction(env) {
  const script = `
    const exported = require('./index.js');
    const out = {};
    for (const [name, fn] of Object.entries(exported)) {
      const endpoint = fn && fn.__endpoint;
      if (endpoint) out[name] = (endpoint.secretEnvironmentVariables || []).map(s => s.key);
    }
    process.stdout.write(JSON.stringify(out));`;
  const text = execFileSync(process.execPath, ["-e", script], { cwd: dir, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(String(text));
}

describe("the shop's platform key", () => {
  test("only a shop on the platform's payments or email sender needs it", () => {
    expect(usesPlatformServices({ paymentMode: "own", platformEmailUrl: "" })).toBe(false);
    expect(usesPlatformServices({ paymentMode: "platform", platformEmailUrl: "" })).toBe(true);
    expect(usesPlatformServices({ paymentMode: "own", platformEmailUrl: "https://email.platform.example/shop" })).toBe(true);
    expect(withPlatformKey(["A"], { paymentMode: "own" })).toEqual(["A"]);
    expect(withPlatformKey(["A"], { paymentMode: "platform" })).toEqual(["A", PLATFORM_SERVICE_KEY]);
  });

  test("every function's own secrets list goes through withPlatformKey", () => {
    const files = readdirSync(dir).filter(f => f.endsWith(".js") && !f.includes(".test.") && f !== "platformKey.js");
    const bare = files.filter(f => /secrets:\s*\[/.test(readFileSync(`${dir}${f}`, "utf8")));
    expect(bare).toEqual([]);
  });

  test("on a platform shop every function has the key; on a shop with its own keys none does", () => {
    const platform = secretsByFunction({ SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: "https://payments.platform.example" });
    const names = Object.keys(platform);
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter(name => !platform[name].includes("PLATFORM_SERVICE_KEY"))).toEqual([]);
    // A function with its own list keeps its other secrets too.
    expect(platform.stripeWebhook).toEqual(expect.arrayContaining(["STRIPE_WEBHOOK_SECRET", "PLATFORM_SERVICE_KEY"]));

    const own = secretsByFunction({ SHOP_PAYMENT_MODE: "", PLATFORM_EMAIL_URL: "" });
    expect(Object.values(own).flat()).not.toContain("PLATFORM_SERVICE_KEY");
  }, 60000);
});
