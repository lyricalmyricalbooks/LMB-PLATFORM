// Pretend builder, deploys, pages and release check for the release runner's tests. Nothing here reaches Google.
import { appsOf } from "../../setup/later-steps.js";

/**
 * `fakeWorld({ broken })`: `broken` maps a version to the shops it breaks (`"*"` for all) and how: "pages" (the home
 * page answers 500), "deploy" (the server code deploy throws) or "check" (the release check fails).
 */
export function fakeWorld({ broken = {}, badBuilds = [] } = {}) {
  const live = new Map(); // shopId -> { rules, functions, "pages:shop", "pages:stockroom" } versions
  const calls = [];
  const fault = (version, shopId) => {
    const entry = broken[version];
    if (!entry) return null;
    return entry[shopId] ?? entry["*"] ?? null;
  };
  const set = (shopId, part, version) => {
    if (!live.has(shopId)) live.set(shopId, {});
    live.get(shopId)[part] = version;
  };
  const builds = [];
  return {
    live,
    calls,
    builds,
    /** Puts a shop on `version` as the shop maker would have. */
    seed(row, version) {
      set(row.shopId, "rules", version);
      if (appsOf(row).includes("shop")) set(row.shopId, "functions", version);
      for (const app of appsOf(row)) set(row.shopId, `pages:${app}`, version);
    },
    builder: {
      async build(version) {
        builds.push(version);
        if (badBuilds.includes(version)) throw new Error("vite build exited with 1");
        return `/builds/${version}`;
      },
    },
    deploy: {
      async deployed(shopId, part) {
        const version = live.get(shopId)?.[part];
        if (!version) return null;
        return part.startsWith("pages:") ? { version, url: `https://${shopId}${part === "pages:stockroom" ? "-stockroom" : ""}.web.app` } : { version };
      },
      async rules(shopId, { version, apps }) {
        calls.push(["rules", shopId, version, apps.join("+")]);
        set(shopId, "rules", version);
      },
      async functions(shopId, { version, region, envFile }) {
        calls.push(["functions", shopId, version, region, envFile]);
        if (fault(version, shopId) === "deploy") throw new Error("functions deploy exited with 2");
        set(shopId, "functions", version);
      },
      async pages(shopId, { version, app }) {
        calls.push(["pages", shopId, version, app]);
        set(shopId, `pages:${app}`, version);
      },
    },
    siteCheck: {
      async get(url) {
        const shopId = /^https:\/\/([a-z0-9-]+?)(?:-stockroom)?\.web\.app/.exec(url)[1];
        const version = live.get(shopId)?.["pages:shop"] ?? live.get(shopId)?.["pages:stockroom"];
        return fault(version, shopId) === "pages" ? { status: 500, problems: [] } : { status: 200, problems: [] };
      },
    },
    async releaseCheck(shopId, version) {
      calls.push(["release-check", shopId, version]);
      return fault(version, shopId) === "check" ? { ok: false, error: "5. The order reaches the stockroom: failed" } : { ok: true };
    },
  };
}

/** Per-shop files as the shop maker leaves them (steps 6 and 8). */
export function fakeFiles(name, shopIds) {
  const files = new Map(shopIds.map((id) => [id, `${name} for ${id}`]));
  return { files, read: async (shopId) => files.get(shopId) ?? null, write: async (shopId, text) => void files.set(shopId, text) };
}
