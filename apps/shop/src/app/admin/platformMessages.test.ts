// The platform's messages to the press (code plan 19.14): which banners show, and that only the admin shows them.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DISMISSED_KEY, MAX_SHOWN, parsePlatformMessages, pickPlatformMessages, readDismissed, rememberDismissed } from "./platformMessages";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const msg = (id: string, extra: Record<string, unknown> = {}) => ({ id, words: `Words ${id}`, level: "info", startsAt: iso(NOW - DAY), endsAt: iso(NOW + DAY), ...extra });

describe("the banner's pick", () => {
  it("shows a message only between its start and its end", () => {
    const raw = { messages: [msg("now"), msg("later", { startsAt: iso(NOW + 1) }), msg("over", { endsAt: iso(NOW) }), msg("past", { startsAt: iso(NOW - 3 * DAY), endsAt: iso(NOW - DAY) })] };
    expect(pickPlatformMessages(raw, { now: NOW }).map((m) => m.id)).toEqual(["now"]);
    // The upcoming one shows once its start comes, and the current one goes at its end.
    expect(pickPlatformMessages(raw, { now: NOW + 2 }).map((m) => m.id)).toEqual(["now", "later"]);
    expect(pickPlatformMessages(raw, { now: NOW + DAY }).map((m) => m.id)).toEqual([]);
  });

  it("puts important first, then the earliest start, at most three", () => {
    const raw = { messages: [msg("b", { startsAt: iso(NOW - 2 * DAY) }), msg("a"), msg("imp", { level: "important" }), msg("c", { startsAt: iso(NOW - 10) }), msg("d", { startsAt: iso(NOW - 5) })] };
    const shown = pickPlatformMessages(raw, { now: NOW });
    expect(shown.map((m) => m.id)).toEqual(["imp", "b", "a"]);
    expect(shown.length).toBe(MAX_SHOWN);
  });

  it("leaves out a message the press closed", () => {
    const raw = { messages: [msg("a"), msg("b")] };
    expect(pickPlatformMessages(raw, { now: NOW, dismissed: ["a"] }).map((m) => m.id)).toEqual(["b"]);
  });

  it("trusts nothing malformed and shows nothing without a document", () => {
    expect(pickPlatformMessages(null, { now: NOW })).toEqual([]);
    expect(pickPlatformMessages({ messages: "no" }, { now: NOW })).toEqual([]);
    const raw = { messages: [null, msg("no-words", { words: " " }), msg("no-end", { endsAt: "soon" }), { id: 5 }, msg("odd-level", { level: "shout" }), msg("long", { words: "x".repeat(900) })] };
    const parsed = parsePlatformMessages(raw);
    expect(parsed.map((m) => m.id)).toEqual(["odd-level", "long"]);
    expect(parsed[0].level).toBe("info");
    expect(parsed[1].words.length).toBe(400);
  });
});

describe("closing a banner", () => {
  it("is remembered in this browser, and a blocked store never breaks the admin", () => {
    const saved = new Map<string, string>();
    const store = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) };
    expect(rememberDismissed(store, "a")).toEqual(["a"]);
    expect(rememberDismissed(store, "b")).toEqual(["a", "b"]);
    expect(readDismissed(store)).toEqual(["a", "b"]);
    expect(JSON.parse(saved.get(DISMISSED_KEY)!)).toEqual(["a", "b"]);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readDismissed(blocked)).toEqual([]);
    expect(rememberDismissed(blocked, "c")).toEqual(["c"]);
    saved.set(DISMISSED_KEY, "not json");
    expect(readDismissed(store)).toEqual([]);
  });
});

describe("where the banner shows", () => {
  const SRC = join(__dirname, "..", "..");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

  it("is the admin's only: nothing outside the admin reads the messages", () => {
    const outside = walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes(`${join("app", "admin")}`) && !p.endsWith(".test.ts"));
    expect(outside.length).toBeGreaterThan(20);
    for (const file of outside) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/platformMessages|PlatformMessages|"platform", "messages"|platform\/messages/);
    }
  });

  it("sits over every admin page, under the plan's banner", () => {
    const dashboard = readFileSync(join(__dirname, "Dashboard.tsx"), "utf8");
    expect(dashboard).toMatch(/<PlanBannerBar plan=\{platformPlan\} \/>[\s\S]{0,200}<PlatformMessagesBar enabled=\{!!user\} \/>/);
  });
});
