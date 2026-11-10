// scripts/deployConfig.mjs builds the shared shops project's deploy files from the templates (plan 1.14b, the shared system):
// one set of rules for every shop, naming no owner, and firebase.deploy.json pointing at the checked copies.
import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_FILE, FRONT_DOOR, OUT_DIR, PER_SHOP_FILES, buildFirebaseConfig, checkRules, frontDoorHosting, functionsRegion, writeDeployFiles } from "./deployConfig.mjs";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const firestoreRules = read("firestore.rules");
const storageRules = read("storage.rules");
const template = JSON.parse(read("firebase.json"));

describe("rules templates", () => {
  it("name no owner: the owner's address comes from the shop's record, inside the shop's folder", () => {
    for (const rules of [firestoreRules, storageRules]) {
      expect(rules).not.toContain("__SHOP_OWNER_EMAIL__");
      expect(rules.replace(/\/\/.*$/gm, "")).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      expect(rules).toContain("match /shops/{shopId}");
      expect(rules).toContain(rules === firestoreRules ? "shopOwnerEmail()" : "shopRecord().get(\"ownerEmail\", \"-\")");
      expect(checkRules(rules)).toBe(rules);
    }
  });

  it("refuse rules that name an address or the old owner slot", () => {
    expect(() => checkRules('allow read: if request.auth.token.email == "__SHOP_OWNER_EMAIL__";')).toThrow(/slot/);
    expect(() => checkRules('allow read: if request.auth.token.email == "someone@else.test";')).toThrow(/address/);
    expect(checkRules("// owner@example.com in a comment is fine\nallow read: if false;")).toContain("allow read");
  });
});

describe("firebase.deploy.json", () => {
  it("is the template with the project's own Hosting site and the checked rules", () => {
    const config = buildFirebaseConfig(template, "press-two-shop", { region: "us-central1" });
    expect(config.hosting.site).toBe("press-two-shop");
    expect(config.firestore.rules).toBe(`${OUT_DIR}/firestore.rules`);
    expect(config.storage.rules).toBe(`${OUT_DIR}/storage.rules`);
    expect({ ...config, hosting: frontDoorHosting({ ...template.hosting, site: "press-two-shop" }, "us-central1"), firestore: { ...config.firestore, rules: template.firestore.rules }, storage: template.storage })
      .toEqual({ ...config, firestore: template.firestore, storage: template.storage });
    expect({ ...config, hosting: template.hosting, firestore: template.firestore, storage: template.storage }).toEqual(template);
    expect(template.firestore.rules).toBe("firestore.rules");
  });

  // The shared system, step 5 (functions/frontDoor.js): one site for every shop.
  it("leaves every shop's own files out of the site and sends their addresses to the front door", () => {
    const hosting = buildFirebaseConfig(template, "press-two-shop", { region: "us-central1" }).hosting;
    for (const file of ["shop-profile.js", "stockroom/shop-profile.js", "index.html", "books/**", "sitemap.xml", "robots.txt", "storefront-data.json"]) {
      expect(hosting.ignore, file).toContain(file);
    }
    expect(PER_SHOP_FILES).not.toContain("spa.html");
    const door = (path: string) => hosting.rewrites.find((r: any) => (r.source ? r.source === path : new RegExp(r.regex).test(path)));
    for (const path of ["/shop-profile.js", "/stockroom/shop-profile.js", "/sitemap.xml", "/robots.txt", "/", "/books/night-buses", "/collections/new"]) {
      expect(door(path)?.function, path).toEqual({ functionId: FRONT_DOOR, region: "us-central1" });
    }
    // The app's own pages still go to the blank app, before the front door ever sees them.
    for (const path of ["/admin", "/checkout", "/account/orders", "/stockroom/app"]) expect(door(path)?.function, path).toBeUndefined();
    expect(() => buildFirebaseConfig(template, "press-two-shop", { region: "nowhere" })).toThrow(/region/);
  });

  // The functions run where the shop profile says (northamerica-northeast1 for the shared project): a front door that
  // pointed anywhere else would answer nothing, so there is no default region.
  it("sends the front door to the functions' own region, and refuses to guess one", () => {
    const hosting = buildFirebaseConfig(template, "press-two-shop", { region: "northamerica-northeast1" }).hosting;
    expect(hosting.rewrites.find((r: any) => r.source === "/shop-profile.js")?.function.region).toBe("northamerica-northeast1");
    expect(() => buildFirebaseConfig(template, "press-two-shop")).toThrow(/region/);
    const profile = () => "europe-west2";
    expect(functionsRegion(["--project", "p", "--region", "us-east1"], { SHOP_FUNCTIONS_REGION: "us-west1" }, profile)).toBe("us-east1");
    expect(functionsRegion(["--project", "p"], { SHOP_FUNCTIONS_REGION: " us-west1 " }, profile)).toBe("us-west1");
    expect(functionsRegion(["--project", "p"], {}, profile)).toBe("europe-west2");
    expect(() => functionsRegion([], {}, () => { throw new Error("functionsRegion missing from public/shop-profile.js"); })).toThrow(/functionsRegion/);
  });

  it("refuses a project id Firebase wouldn't accept", () => {
    for (const bad of ["", "Shop", "a", "has_underscore", "-starts-with-dash"]) expect(() => buildFirebaseConfig(template, bad, { region: "us-central1" })).toThrow(/project id/);
  });

  it("writes the deploy files next to the templates, the rules unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-config-"));
    try {
      for (const file of ["firebase.json", "firestore.rules", "storage.rules"]) cpSync(join(ROOT, file), join(dir, file));
      const written = writeDeployFiles({ root: dir, projectId: "press-two-shop", region: "northamerica-northeast1" });
      expect(written).toEqual([join(OUT_DIR, "firestore.rules"), join(OUT_DIR, "storage.rules"), CONFIG_FILE]);
      const config = JSON.parse(readFileSync(join(dir, CONFIG_FILE), "utf8"));
      expect(readFileSync(join(dir, config.firestore.rules), "utf8")).toBe(firestoreRules);
      expect(readFileSync(join(dir, config.storage.rules), "utf8")).toBe(storageRules);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing when a rules file names an address", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-config-"));
    try {
      for (const file of ["firebase.json", "storage.rules"]) cpSync(join(ROOT, file), join(dir, file));
      writeFileSync(join(dir, "firestore.rules"), 'allow read: if request.auth.token.email == "a@b.co";');
      expect(() => writeDeployFiles({ root: dir, projectId: "press-two-shop", region: "northamerica-northeast1" })).toThrow(/address/);
      expect(existsSync(join(dir, OUT_DIR))).toBe(false);
      expect(existsSync(join(dir, CONFIG_FILE))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the deploy and the checks use the same rules", () => {
  it("the backend deploy builds the files and deploys from them", () => {
    const workflow = read(".github/workflows/deploy-firebase.yml");
    expect(workflow).toContain("node scripts/deployConfig.mjs --project");
    expect(workflow).toContain("--config firebase.deploy.json");
    expect(workflow.indexOf("scripts/deployConfig.mjs")).toBeLessThan(workflow.indexOf("--config firebase.deploy.json"));
  });

  it("the rules emulator check runs the rules as they are, inside shop folders", () => {
    const script = read("scripts/firestore-rules-emulator.mjs");
    expect(script).not.toContain("__SHOP_OWNER_EMAIL__");
    expect(script).toContain('doc(fs, "shops", shop)');
  });

  it("the generated files are never committed", () => {
    const ignore = read(".gitignore").split("\n");
    expect(ignore).toContain(`${OUT_DIR}/`);
    expect(ignore).toContain(CONFIG_FILE);
  });
});
