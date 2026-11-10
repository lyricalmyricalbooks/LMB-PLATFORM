// The shop's platform key (platformKey.js, plan 2.2) must reach every function on a shop that uses the platform's
// services, and no function on a shop that doesn't (its deploy would otherwise ask for a secret it lacks).
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { OWN_KEYS, usesPlatformServices, withPlatformKey, PLATFORM_SERVICE_KEY } = require("./platformKey.js");
const dir = fileURLToPath(new URL(".", import.meta.url));

// Loads the functions as the deploy does and lists, per function, the secrets it declares.
function secretsByFunction(env) {
  const script = `
    const exported = require('./index.js');
    const out = {};
    for (const [name, fn] of Object.entries(exported)) {
      const endpoint = fn && fn.__endpoint;
      if (endpoint) out[name] = (endpoint.secretEnvironmentVariables || []).map(s => s.key);
    }
    // Every secret the deploy will ask for: Firebase asks for each one defined, used or not.
    const declared = globalThis[Symbol.for("firebase-functions:params:declaredParams")] || [];
    out.__declared = declared.filter(p => p && p.constructor && p.constructor.name === "SecretParam").map(p => p.name);
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
    expect(withPlatformKey([{ name: "RESEND_API_KEY" }, { name: "A" }], { paymentMode: "platform" })).toEqual([{ name: "A" }, PLATFORM_SERVICE_KEY]);
  });

  test("every function's own secrets list goes through withPlatformKey", () => {
    const files = readdirSync(dir).filter(f => f.endsWith(".js") && !f.includes(".test.") && f !== "platformKey.js");
    const bare = files.filter(f => /secrets:\s*\[/.test(readFileSync(`${dir}${f}`, "utf8")));
    expect(bare).toEqual([]);
  });

  test("on a platform shop every function has the key; on a shop with its own keys none does", () => {
    const platform = secretsByFunction({ SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: "https://payments.platform.example" });
    const declared = platform.__declared;
    delete platform.__declared;
    // The deploy stops for any defined secret it can't find, so a platform shop defines only the platform key.
    expect(declared).toEqual(["PLATFORM_SERVICE_KEY"]);
    const names = Object.keys(platform);
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter(name => !platform[name].includes("PLATFORM_SERVICE_KEY"))).toEqual([]);
    // The shared server asks for no key a press would own: the deploy would stop for a secret no shop has.
    expect(Object.values(platform).flat().filter(name => OWN_KEYS.has(name))).toEqual([]);

    const own = secretsByFunction({ SHOP_PAYMENT_MODE: "", PLATFORM_EMAIL_URL: "" });
    expect(own.__declared).toEqual(expect.arrayContaining(["RESEND_API_KEY", "STRIPE_SECRET_KEY"]));
    delete own.__declared;
    expect(Object.values(own).flat()).not.toContain("PLATFORM_SERVICE_KEY");
    // A shop on its own keys keeps them.
    expect(own.stripeWebhook).toEqual(expect.arrayContaining(["STRIPE_WEBHOOK_SECRET"]));
  }, 60000);
});
