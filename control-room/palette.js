// The control room's five groups and its find bar (Ctrl K or ⌘K): every page and place, the common actions, and the
// shops. Plain browser JavaScript, shared by the page (app.js) and its tests (palette.test.js).
import { shopMatches } from "./shopSearch.js";

/**
 * The menu's five groups (handoff "Control Room Redesign"): every page of the room belongs to one, so nothing was
 * removed, only regrouped. `tabs` are the pills across the top of a grouped page; Platform's tools are cards instead.
 */
export const GROUPS = [
  { id: "today", name: "Today", pages: ["today"] },
  { id: "shops", name: "Shops", pages: ["shops", "signups", "setting-up"], tabs: [["shops", "Shops"], ["signups", "Sign-ups"], ["setting-up", "Setting up"]] },
  { id: "inbox", name: "Inbox", pages: ["support", "repairs", "recovery", "apps"], tabs: [["support", "Support"], ["repairs", "Repairs"], ["recovery", "Account recovery"], ["apps", "App store"]] },
  { id: "money", name: "Money", pages: ["money", "failed-payments", "brands-leaving", "costs", "settings"], tabs: [["money", "Income"], ["failed-payments", "Failed payments"], ["brands-leaving", "Why brands leave"], ["costs", "Costs"], ["settings", "Prices and sign-up"]] },
  { id: "platform", name: "Platform", pages: ["platform", "launch", "jobs", "messages", "runbook", "breaches", "activity", "payments"] },
];

/** Every page of the five groups, and the places on a page worth jumping to. `go` is the address's #. */
export const PLACES = Object.freeze([
  { words: "Today", go: "today", group: "Today" },
  { words: "Your test shops", go: "test-shop", group: "Today" },
  { words: "Brands at risk", go: "at-risk", group: "Today" },
  { words: "Still time to talk", go: "save-list", group: "Today" },
  { words: "Tax lines", go: "tax-watch", group: "Today" },
  { words: "Everything for every shop", go: "apps-closing", group: "Today" },
  { words: "Shops", go: "shops", group: "Shops" },
  { words: "Sign-ups and the waitlist", go: "signups", group: "Shops" },
  { words: "Setting up", go: "setting-up", group: "Shops" },
  { words: "Support", go: "support", group: "Inbox" },
  { words: "Repairs", go: "repairs", group: "Inbox" },
  { words: "Account recovery", go: "recovery", group: "Inbox" },
  { words: "App store", go: "apps", group: "Inbox" },
  { words: "Income over time", go: "money", group: "Money" },
  { words: "Fair till by month", go: "fair-months", group: "Money" },
  { words: "Failed plan payments", go: "failed-payments", group: "Money" },
  { words: "Why brands leave", go: "brands-leaving", group: "Money" },
  { words: "Costs", go: "costs", group: "Money" },
  { words: "Prices and sign-up", go: "settings", group: "Money" },
  { words: "Platform tools", go: "platform", group: "Platform" },
  { words: "Launch", go: "launch", group: "Platform" },
  { words: "Jobs and releases", go: "jobs", group: "Platform" },
  { words: "Messages to brands", go: "messages", group: "Platform" },
  { words: "Run book", go: "runbook", group: "Platform" },
  { words: "Breach register", go: "breaches", group: "Platform" },
  { words: "Activity log", go: "activity", group: "Platform" },
  { words: "Emergency payments", go: "payments", group: "Platform" },
]);

/** The things you do often, each a place to go or a named job the page runs. */
export const ACTIONS = Object.freeze([
  { words: "Invite someone to sign up", go: "invite-form" },
  { words: "Send a message to brands", go: "message-form" },
  { words: "Act as a shop…", run: "act-as" },
  { words: "Write a breach in the register", go: "breach-form" },
  { words: "Refresh the numbers", run: "refresh" },
  { words: "Day or night", run: "appearance" },
  { words: "Sign out", run: "sign-out" },
]);

const has = (text, typed) => {
  const words = String(typed ?? "").trim().toLowerCase();
  if (!words) return true;
  const hay = String(text).toLowerCase();
  return words.split(/\s+/).every((word) => hay.includes(word));
};

/**
 * What the find bar shows for `typed`: shops first when something is typed (at most `max`), then actions and places.
 * `mode: "shops"` lists only shops (Act as a shop…). Each result is { kind: "shop" | "action" | "place", words, … }.
 */
export function findResults(typed, { shops = [], tags = {}, mode = "all", max = 8 } = {}) {
  const words = String(typed ?? "").trim();
  const shopRows = shops.filter((shop) => shopMatches(shop, words, tags[shop.shopId]))
    .slice(0, words || mode === "shops" ? max : 0)
    .map((shop) => ({ kind: "shop", words: shop.pressName ?? shop.shopId, detail: [shop.ownerEmail, shop.shopId].filter(Boolean).join(" · "), shopId: shop.shopId }));
  if (mode === "shops") return shopRows;
  const actions = ACTIONS.filter((a) => has(a.words, words)).map((a) => ({ kind: "action", ...a }));
  const places = PLACES.filter((p) => has(`${p.words} ${p.group}`, words)).map((p) => ({ kind: "place", ...p, detail: p.group }));
  return [...shopRows, ...actions, ...places];
}
