import { describe, expect, it } from "vitest";
import { addedNoticeOn, addedNoticeSeconds, noticeAllowedOn } from "./addedNotice";

describe("Added to your bag notice rules", () => {
  it("is off unless chosen", () => {
    expect(addedNoticeOn(undefined)).toBe(false);
    expect(addedNoticeOn({})).toBe(false);
    expect(addedNoticeOn({ cartAddAction: "drawer" })).toBe(false);
    expect(addedNoticeOn({ cartAddAction: "notice" })).toBe(true);
  });
  it("closes after 6 seconds by default, 0 keeps it, values are clamped", () => {
    expect(addedNoticeSeconds({})).toBe(6);
    expect(addedNoticeSeconds({ cartAddNoticeSeconds: "" })).toBe(6);
    expect(addedNoticeSeconds({ cartAddNoticeSeconds: 0 })).toBe(0);
    expect(addedNoticeSeconds({ cartAddNoticeSeconds: "10" })).toBe(10);
    expect(addedNoticeSeconds({ cartAddNoticeSeconds: 99 })).toBe(30);
    expect(addedNoticeSeconds({ cartAddNoticeSeconds: -4 })).toBe(0);
  });
  it("never shows on checkout", () => {
    expect(noticeAllowedOn("/books/x")).toBe(true);
    expect(noticeAllowedOn("/checkout")).toBe(false);
    expect(noticeAllowedOn("/shop/checkout/")).toBe(false);
    expect(noticeAllowedOn("/checkouts-guide")).toBe(true);
  });
});
