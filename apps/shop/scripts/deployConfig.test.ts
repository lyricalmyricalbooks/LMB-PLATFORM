// scripts/deployConfig.mjs builds one shop's deploy files from the templates (plan 1.14b): the rules hold a slot for the
// owner's address instead of a hard-coded one, and firebase.deploy.json points at the filled-in copies.
import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, OUT_DIR, OWNER_PLACEHOLDER, buildFirebaseConfig, fillRules, ownerAddress, ownerFromEnvFile, writeDeployFiles } from "./deployConfig.mjs";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const firestoreRules = read("firestore.rules");
const storageRules = read("storage.rules");
const template = JSON.parse(read("firebase.json"));

describe("rules templates", () => {
  it("name the owner only through the slot, never a real address", () => {
    for (const rules of [firestoreRules, storageRules]) {
      expect(rules).toContain(`request.auth.token.email == "${OWNER_PLACEHOLDER}"`);
      // No email address is written into the rules at all.
      expect(rules.replace(/\/\/.*$/gm, "")).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    }
    expect(firestoreRules).toContain(`email != "${OWNER_PLACEHOLDER}"`);
  });

  it("fill every slot with the owner's address, in lower case", () => {
    for (const rules of [firestoreRules, storageRules]) {
      const filled = fillRules(rules, " Owner@Press.Test ");
      expect(filled).not.toContain(OWNER_PLACEHOLDER);
      expect(filled).toContain('request.auth.token.email == "owner@press.test"');
      expect(filled.split("owner@press.test").length).toBe(rules.split(OWNER_PLACEHOLDER).length);
    }
  });

  it("refuse a missing or unsafe address rather than write broken rules", () => {
    for (const bad of ["", "  ", "owner", 'a"@b.co', "a b@c.co", "a@b", "a\\@b.co", "{x}@b.co", OWNER_PLACEHOLDER, undefined]) {
      expect(ownerAddress(bad), String(bad)).toBe("");
      expect(() => fillRules(firestoreRules, bad as string), String(bad)).toThrow(/owner/);
    }
    expect(() => fillRules('match /x { allow read: if request.auth.token.email == "someone@else.test"; }', "owner@press.test")).toThrow(/doesn't name/);
  });
});

describe("firebase.deploy.json", () => {
  it("is the template with the shop's own Hosting site and the filled-in rules", () => {
    const config = buildFirebaseConfig(template, "press-two-shop");
    expect(config.hosting.site).toBe("press-two-shop");
    expect(config.firestore.rules).toBe(`${OUT_DIR}/firestore.rules`);
    expect(config.storage.rules).toBe(`${OUT_DIR}/storage.rules`);
    // Everything else is the template's.
    expect({ ...config, hosting: { ...config.hosting, site: template.hosting.site }, firestore: { ...config.firestore, rules: template.firestore.rules }, storage: template.storage })
      .toEqual(template);
    // The template itself is left alone.
    expect(template.firestore.rules).toBe("firestore.rules");
  });

  it("refuses a project id Firebase wouldn't accept", () => {
    for (const bad of ["", "Shop", "a", "has_underscore", "-starts-with-dash"]) expect(() => buildFirebaseConfig(template, bad)).toThrow(/project id/);
  });

  it("writes the deploy files next to the templates", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-config-"));
    try {
      for (const file of ["firebase.json", "firestore.rules", "storage.rules"]) cpSync(join(ROOT, file), join(dir, file));
      const written = writeDeployFiles({ root: dir, projectId: "press-two-shop", owner: "owner@press.test" });
      expect(written).toEqual([join(OUT_DIR, "firestore.rules"), join(OUT_DIR, "storage.rules"), CONFIG_FILE]);
      const config = JSON.parse(readFileSync(join(dir, CONFIG_FILE), "utf8"));
      for (const rulesPath of [config.firestore.rules, config.storage.rules]) {
        const text = readFileSync(join(dir, rulesPath), "utf8");
        expect(text).toContain('"owner@press.test"');
        expect(text).not.toContain(OWNER_PLACEHOLDER);
      }
      // The templates are untouched.
      expect(readFileSync(join(dir, "firestore.rules"), "utf8")).toBe(firestoreRules);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing when the owner address is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-config-"));
    try {
      for (const file of ["firebase.json", "firestore.rules", "storage.rules"]) cpSync(join(ROOT, file), join(dir, file));
      expect(() => writeDeployFiles({ root: dir, projectId: "press-two-shop", owner: "" })).toThrow(/owner/);
      expect(existsSync(join(dir, OUT_DIR))).toBe(false);
      expect(existsSync(join(dir, CONFIG_FILE))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("where the owner address comes from", () => {
  it("reads SHOP_OWNER_EMAIL from the Cloud Functions' .env file, the same value the server uses", () => {
    expect(ownerFromEnvFile("APP_CHECK_MODE=monitor\nSHOP_OWNER_EMAIL=owner@press.test\n")).toBe("owner@press.test");
    expect(ownerFromEnvFile('SHOP_OWNER_EMAIL="owner@press.test"\r\n')).toBe("owner@press.test");
    expect(ownerFromEnvFile("SITE_URL=https://press.test\n")).toBe("");
    expect(read("functions/shopConfig.js")).toContain("SHOP_OWNER_EMAIL");
  });
});

describe("the deploy and the checks use the filled-in rules", () => {
  it("the backend deploy builds the files and deploys from them", () => {
    const workflow = read(".github/workflows/deploy-firebase.yml");
    expect(workflow).toContain("node scripts/deployConfig.mjs --project");
    expect(workflow).toContain("--config firebase.deploy.json");
    expect(workflow.indexOf("scripts/deployConfig.mjs")).toBeLessThan(workflow.indexOf("--config firebase.deploy.json"));
    expect(workflow).toContain("SHOP_OWNER_EMAIL: ${{ vars.SHOP_OWNER_EMAIL }}");
  });

  it("the rules emulator check fills the slot the same way", () => {
    expect(read("scripts/firestore-rules-emulator.mjs")).toContain(`.replaceAll("${OWNER_PLACEHOLDER}", "owner@example.com")`);
  });

  it("the generated files are never committed", () => {
    const ignore = read(".gitignore").split("\n");
    expect(ignore).toContain(`${OUT_DIR}/`);
    expect(ignore).toContain(CONFIG_FILE);
  });
});
