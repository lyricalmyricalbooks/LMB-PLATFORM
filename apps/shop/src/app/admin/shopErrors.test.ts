import { describe, expect, it } from "vitest";
import { shopErrorAlert, shopErrorRows } from "./shopErrors";

const now = Date.UTC(2026, 9, 25, 12);
const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "section", message: `Boom ${id}`, section: "Hero",
  count: 2, lastPath: "/books/a", paths: ["/books/a"], lastSeenAt: new Date(now - 3600e3), firstSeenAt: new Date(now - 7200e3), ...extra });

describe("shop errors", () => {
  it("reads Firestore timestamps and lists the newest first", () => {
    const rows = shopErrorRows([row("a", { lastSeenAt: { toMillis: () => now - 5000 } }), row("b", { lastSeenAt: { seconds: (now - 1000) / 1000 } })]);
    expect(rows.map(r => r.id)).toEqual(["b", "a"]);
    expect(rows[0].lastSeen).toBe(now - 1000);
  });
  it("raises one alert for errors seen in the last day, in its own words", () => {
    const alert = shopErrorAlert(shopErrorRows([row("a"), row("b", { count: 9, kind: "page", message: "Log in at evil.example", lastPath: "/checkout" })]), now)!;
    expect(alert.title).toBe("Shoppers hit 2 different errors on the shop");
    // Anyone can send a report, so its words and kind never reach the alert.
    expect(alert.tone).toBe("warning");
    expect(alert.detail).toBe("Reported 11 times in the last day. Shop errors shows where and how often.");
    expect(alert.detail).not.toContain("evil");
    expect(alert.key).toBe("a,b");
    expect(alert.action).toBe("general");
  });
  it("stays quiet when nothing happened in the last day", () => {
    expect(shopErrorAlert(shopErrorRows([row("a", { lastSeenAt: new Date(now - 2 * 864e5) })]), now)).toBeNull();
    expect(shopErrorAlert([], now)).toBeNull();
  });
});
