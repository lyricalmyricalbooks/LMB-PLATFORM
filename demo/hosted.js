// The sample press (plan 7.7, docs/demo-shop.md "The sample press"): the demo shop on a server anyone can open before
// signing up. It is the same demo (the made-up project demo-colophon-test on the Firebase emulators, seeded by
// seed.js), run with `npm run demo -- --sample-press <public host>`, and differs in four ways:
//
// 1. Read-only for visitors. Every rules file keeps its reads and loses its writes, so a visitor can look at the shop,
//    its admin, Studio and the stockroom, and nothing they try is kept.
// 2. No email and no payment can happen. The shop's server code (the only thing that sends email or takes a card) is
//    never started, the gate never opens its port, and the seed holds no payment or email keys.
// 3. A gate (gate.js) is the only thing visitors reach. It refuses the emulators' own back doors: the "owner" pass that
//    skips the rules, and the addresses that clear data or change rules.
// 4. It starts fresh every night (reset.js): everything is cleared and seeded again.
//
// Each page says "Nothing you do here is saved". Pure settings and checks here; gate.js and reset.js do the work.
import { demoRules, emulatorConfig, HOST, PORTS, profileScript, viteEnv } from "./config.js";

export const SAMPLE_NOTICE = "This is a sample press to try. Nothing you do here is saved, and it starts fresh every night.";

// Visitors reach the emulators on their usual ports (the apps have them built in), through the gate. The emulators
// themselves listen only on this computer, on these ports.
export const INTERNAL_PORTS = Object.freeze({
  auth: 19099,
  firestore: 18080,
  database: 19000,
  storage: 19199,
  hub: 14400,
  logging: 14500,
});

/** The ports the gate opens to visitors, and where each goes. The shop's server code (functions) is never among them. */
export const GATE_PORTS = Object.freeze({
  [PORTS.auth]: { kind: "emulator", name: "auth", to: INTERNAL_PORTS.auth },
  [PORTS.firestore]: { kind: "emulator", name: "firestore", to: INTERNAL_PORTS.firestore },
  [PORTS.database]: { kind: "emulator", name: "database", to: INTERNAL_PORTS.database },
  [PORTS.storage]: { kind: "emulator", name: "storage", to: INTERNAL_PORTS.storage },
  [PORTS.shop]: { kind: "app", name: "shop" },
  [PORTS.stockroom]: { kind: "app", name: "stockroom" },
});

/** The night-time reset hour, in the server's own time zone. */
export const RESET_HOUR = 3;

const WRITES = new Set(["write", "create", "update", "delete"]);

/**
 * Firestore or Storage rules with every write taken out: `allow read, write: if x;` becomes `allow read: if x;`, and a
 * statement that only wrote becomes a comment. The emulator's "owner" pass (used by the seed and the reset) skips rules,
 * so they still work.
 */
export function readOnlyRules(text) {
  const start = /allow\s+([a-z,\s]+?)\s*:\s*if\b/g;
  let out = "";
  let from = 0;
  let changed = 0;
  for (let found; (found = start.exec(text));) {
    // The condition runs to the first ";" outside quotes and comments (a pattern string can hold one, a comment an
    // apostrophe).
    let end = start.lastIndex;
    for (let quote = ""; end < text.length; end += 1) {
      const c = text[end];
      if (quote) {
        if (c === "\\") end += 1;
        else if (c === quote) quote = "";
      } else if (c === "/" && text[end + 1] === "/") {
        const line = text.indexOf("\n", end);
        end = line < 0 ? text.length : line;
      } else if (c === "/" && text[end + 1] === "*") {
        const close = text.indexOf("*/", end + 2);
        end = close < 0 ? text.length : close + 1;
      } else if (c === "'" || c === '"') quote = c;
      else if (c === ";") break;
    }
    if (end >= text.length) throw new Error("A rule has no closing semicolon.");
    const list = found[1].split(",").map((m) => m.trim()).filter(Boolean);
    const reads = list.filter((m) => !WRITES.has(m));
    out += text.slice(from, found.index);
    if (reads.length === list.length) out += text.slice(found.index, end + 1);
    else {
      changed += 1;
      out += reads.length ? `allow ${reads.join(", ")}: if${text.slice(start.lastIndex, end)};` : "/* sample press: read-only */";
    }
    from = end + 1;
    start.lastIndex = end + 1;
  }
  out += text.slice(from);
  const left = out.match(/allow\s+[a-z,\s]*\b(write|create|update|delete)\b/);
  if (left) throw new Error(`A rule still allows a write after making the rules read-only: ${out.slice(left.index, left.index + 80)}`);
  return { text: out, changed };
}

/** Realtime Database rules (JSON with comments) with every ".write" set to false. */
export function readOnlyDatabaseRules(text) {
  return text.replace(/"\.write"\s*:\s*("(?:[^"\\]|\\.)*"|true|false)/g, '".write": false');
}

/** Every rules file the sample press loads: the demo's rules, read-only. */
export function sampleRules(read) {
  return demoRules(read).map(({ file, text }) => ({
    file,
    text: file.endsWith(".json")
      ? readOnlyDatabaseRules(text)
      : `// Sample press: read-only for visitors (LMB-PLATFORM demo/hosted.js).\n${readOnlyRules(text).text}`,
  }));
}

/** firebase.json for the sample press: no server code, no control panel, every emulator on this computer only. */
export function sampleEmulatorConfig() {
  const base = emulatorConfig({ functionsSource: null });
  const at = (port) => ({ host: HOST, port });
  return {
    ...base,
    emulators: {
      singleProjectMode: true,
      auth: at(INTERNAL_PORTS.auth),
      firestore: at(INTERNAL_PORTS.firestore),
      database: at(INTERNAL_PORTS.database),
      storage: at(INTERNAL_PORTS.storage),
      ui: { enabled: false },
      hub: at(INTERNAL_PORTS.hub),
      logging: at(INTERNAL_PORTS.logging),
    },
  };
}

/** The apps' build settings: the emulator switch, pointed at the sample press's public host name. */
export function sampleViteEnv(publicHost) {
  if (!/^[a-z0-9.-]+$/i.test(publicHost ?? "")) throw new Error("The sample press needs its public host name, such as sample.yourpress.example.");
  return { ...viteEnv(), VITE_FIREBASE_EMULATOR_HOST: publicHost };
}

/**
 * The profile file with the notice added: a bar along the bottom of every page of the shop and the stockroom. System
 * colours (Canvas / CanvasText), so it follows the visitor's light or dark setting without colours of its own.
 */
export function sampleProfileScript(profile) {
  const notice = `(function () {
  var NOTICE = ${JSON.stringify(SAMPLE_NOTICE)};
  function add() {
    if (document.getElementById("sample-press-notice")) return;
    var bar = document.createElement("div");
    bar.id = "sample-press-notice";
    bar.setAttribute("role", "status");
    bar.textContent = NOTICE;
    bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:8px 16px;text-align:center;font:14px/1.4 system-ui,sans-serif;background:Canvas;color:CanvasText;border-top:2px solid CanvasText";
    document.body.appendChild(bar);
    document.body.style.paddingBottom = "48px";
  }
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
})();
`;
  return `${profileScript(profile)}${notice}`;
}

/**
 * Why the gate refuses a visitor's request, or null to pass it on. `port` is the public port it came in on.
 * Refused: any port that isn't one of GATE_PORTS (the shop's server code above all), the emulators' "owner" pass in a
 * header or the address, and the emulators' own admin addresses (clearing data, changing rules, exporting).
 */
export function gateRefusal(port, { method = "GET", url = "/", headers = {} } = {}) {
  const entry = GATE_PORTS[port];
  if (!entry) return "closed";
  if (entry.kind === "app") return method === "GET" || method === "HEAD" ? null : "read-only";
  const auth = String(headers.authorization ?? headers.Authorization ?? "").trim();
  if (/^bearer\s+owner$/i.test(auth)) return "owner pass";
  const target = new URL(url, "http://gate");
  for (const key of ["access_token", "auth"]) if (target.searchParams.get(key) === "owner") return "owner pass";
  const path = decodeURIComponent(target.pathname);
  // The sign-in emulator's practice Google window lives at /emulator/auth/… and reads the project's sign-in settings;
  // everything else under /emulator/ is admin.
  const signInWindow = entry.name === "auth" && (path.startsWith("/emulator/auth/") || (method === "GET" && /^\/emulator\/v1\/projects\/[^/]+\/config$/.test(path)));
  if (path.startsWith("/emulator/") && !signInWindow) return "admin";
  if (path.startsWith("/internal/") || path.includes("/.settings/")) return "admin";
  if (entry.name === "auth" && /\/v\d+\/projects\//.test(path) && !signInWindow) return "admin";
  return null;
}

/** Milliseconds from `now` to the next reset at RESET_HOUR:00 (server time). */
export function msUntilReset(now = new Date(), hour = RESET_HOUR) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** A fetch that sends the seed's usual emulator ports (127.0.0.1:PORTS) to the sample press's internal ones. */
export function internalFetch(fetch) {
  const map = Object.fromEntries(Object.entries(INTERNAL_PORTS).map(([name, port]) => [String(PORTS[name]), String(port)]));
  return (target, init) => {
    const address = new URL(String(target));
    if (address.hostname === HOST && map[address.port]) address.port = map[address.port];
    return fetch(address.href, init);
  };
}

