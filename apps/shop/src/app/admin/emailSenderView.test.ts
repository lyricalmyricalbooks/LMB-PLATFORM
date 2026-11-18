import { describe, expect, it } from "vitest";
import { agoWords, currentRows, deliveryDetail, deliveryKind, deliveryStats, deliveryTime, initialOf, sendMethod, senderHealth, shownDeliveries, toDate } from "./emailSenderView";

const NOW = new Date("2026-11-18T15:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const rows = [
  { id: "1", at: at(4), to: "ada@mail.example", subject: "Order confirmed: LM-1", status: "failed", error: "552 Mailbox full", outboxId: "q1" },
  { id: "2", at: at(30), to: "ben@mail.example", subject: "Your order is on the way!", status: "bounced", error: "550 No such user here" },
  { id: "3", at: at(50), to: "cleo@mail.example", subject: "Did you forget something?", status: "complained" },
  { id: "4", at: at(70), to: "dan@mail.example", subject: "Your order is on the way!", status: "sent", keySource: "gmail" },
  { id: "5", at: at(90), to: "eve@mail.example", subject: "Order confirmed: LM-2", status: "queued", outboxId: "q2" },
  { id: "6", at: at(60 * 30), to: "fay@mail.example", subject: "Order refunded", status: "sent" },
];

describe("deliveryKind and deliveryDetail", () => {
  it("sorts each row into problem, waiting, paused, sent or stopped", () => {
    expect(rows.map(deliveryKind)).toEqual(["problem", "problem", "paused", "sent", "waiting", "sent"]);
    expect(deliveryKind({ id: "x", status: "cancelled" })).toBe("stopped");
  });
  it("says why in plain words", () => {
    expect(deliveryDetail(rows[0])).toBe("Mailbox full");
    expect(deliveryDetail(rows[1])).toBe("Address doesn't exist");
    expect(deliveryDetail({ id: "x", status: "failed", error: "Message rejected by policy" })).toBe("Rejected by their provider");
    expect(deliveryDetail(rows[2])).toBe("Marked as spam");
    expect(deliveryDetail(rows[3])).toBe("Delivered");
    expect(deliveryDetail({ id: "x", status: "sent", attempt: 3 })).toBe("Sent on try 3");
    expect(deliveryDetail({ id: "x", status: "failed" })).toBe("Didn't go through");
    expect(deliveryDetail({ id: "x", status: "sent", sandbox: true })).toBe("Test sender: only reaches you");
  });
});

describe("shownDeliveries", () => {
  it("filters and searches", () => {
    expect(shownDeliveries(rows, "all").length).toBe(6);
    expect(shownDeliveries(rows, "problems").map((r) => r.id)).toEqual(["1", "2", "5"]);
    expect(shownDeliveries(rows, "paused").map((r) => r.id)).toEqual(["3"]);
    expect(shownDeliveries(rows, "sent").map((r) => r.id)).toEqual(["4", "6"]);
    expect(shownDeliveries(rows, "all", "BEN@").map((r) => r.id)).toEqual(["2"]);
    expect(shownDeliveries(rows, "all", "on the way").map((r) => r.id)).toEqual(["2", "4"]);
  });
  it("keeps only the newest row of an email the queue later sent", () => {
    const retried = [{ id: "new", at: at(1), to: "ada@mail.example", status: "sent", outboxId: "q1" }, ...rows];
    expect(currentRows(retried).map((r) => r.id)).not.toContain("1");
    expect(shownDeliveries(retried, "problems").map((r) => r.id)).toEqual(["2", "5"]);
  });
});

describe("deliveryStats", () => {
  it("counts today's sends, open problems and paused people", () => {
    expect(deliveryStats(rows, NOW)).toEqual({ sentToday: 1, problems: 3, paused: 1, sent: 2 });
    expect(deliveryStats([], NOW)).toEqual({ sentToday: 0, problems: 0, paused: 0, sent: 0 });
  });
  it("counts one paused person once", () => {
    const twice = [{ id: "a", status: "complained", to: "X@mail.example" }, { id: "b", status: "complained", to: "x@mail.example" }];
    expect(deliveryStats(twice, NOW).paused).toBe(1);
  });
});

describe("times", () => {
  it("reads strings and Firestore timestamps", () => {
    expect(toDate({ seconds: 1 })?.getTime()).toBe(1000);
    expect(toDate("nonsense")).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(deliveryTime(undefined, NOW)).toBe("—");
  });
  it("says how long ago", () => {
    expect(agoWords(at(0), NOW)).toBe("just now");
    expect(agoWords(at(4), NOW)).toBe("4 min ago");
    expect(agoWords(at(60), NOW)).toBe("1 hour ago");
    expect(agoWords(at(60 * 49), NOW)).toBe("2 days ago");
  });
});

describe("sending", () => {
  it("names where emails come from", () => {
    expect(sendMethod({ shared: true, gmailAddress: "" })).toBe("platform");
    expect(sendMethod({ shared: true, gmailAddress: "owner@example.com" })).toBe("gmail");
    expect(sendMethod({ shared: false, gmailAddress: "", lastKeySource: "gmail" })).toBe("gmail");
    expect(sendMethod({ shared: false, gmailAddress: "" })).toBe("backup");
  });
  it("reports health from the newest rows", () => {
    expect(senderHealth([], NOW)).toMatchObject({ tone: "quiet" });
    expect(senderHealth(rows, NOW)).toEqual({ tone: "good", title: "Working normally", line: "Last email sent 1 hour ago" });
    const failing = [1, 2, 3].map((n) => ({ id: String(n), at: at(n), status: "failed" }));
    expect(senderHealth(failing, NOW).tone).toBe("problem");
  });
  it("takes the first letter for the inbox picture", () => {
    expect(initialOf("test studio")).toBe("T");
    expect(initialOf("  ")).toBe("·");
  });
});
