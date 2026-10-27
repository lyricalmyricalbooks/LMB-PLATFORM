import { describe, expect, it } from "vitest";
import { activeAnnouncements, groupSections, isGroupSurface, popupAllowed, popupVersion, shopDay } from "./sectionGroups";

describe("section groups", () => {
  it("knows the three groups and keeps globalSections as the footer group", () => {
    expect(isGroupSurface("headerSections")).toBe(true);
    expect(isGroupSurface("globalSections")).toBe(true);
    expect(isGroupSurface("overlaySections")).toBe(true);
    expect(isGroupSurface("heroPage")).toBe(false);
    expect(groupSections({ headerSections: [{ id: "a" }, { id: "b", visible: false }] }, "headerSections").map(s => s.id)).toEqual(["a"]);
    expect(groupSections({}, "overlaySections")).toEqual([]);
  });
});

describe("announcement messages", () => {
  const noon = new Date("2026-10-09T16:00:00Z"); // 12:00 in Toronto
  it("falls back to the single announcement text when there is no list", () => {
    expect(activeAnnouncements({ announcementText: "Free shipping" }, noon)).toEqual([{ text: "Free shipping" }]);
    expect(activeAnnouncements({ announcementText: "  " }, noon)).toEqual([]);
  });
  it("shows only the messages inside their show-from / show-until days, with links", () => {
    const design = { announcementText: "ignored when a list exists", announcements: [
      { id: "1", text: "Always" },
      { id: "2", text: "Starts tomorrow", from: "2026-10-10" },
      { id: "3", text: "Ended yesterday", until: "2026-10-08" },
      { id: "4", text: "Today only", from: "2026-10-09", until: "2026-10-09", link: "/collections/zines" },
      { id: "5", text: "" },
    ] };
    expect(activeAnnouncements(design, noon)).toEqual([{ text: "Always" }, { text: "Today only", link: "/collections/zines", until: "2026-10-09" }]);
  });
  it("counts days on the shop's calendar", () => {
    expect(shopDay(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09"); // still the 9th in Toronto
  });
});

describe("pop-up", () => {
  it("shows once per visit by default, once ever, or every page", () => {
    expect(popupAllowed(undefined, {})).toBe(true);
    expect(popupAllowed("session", { session: true })).toBe(false);
    expect(popupAllowed("once", { session: false, ever: true })).toBe(false);
    expect(popupAllowed("always", { session: true, ever: true })).toBe(true);
  });
  it("changes its version when its content changes", () => {
    const a = [{ id: "s", type: "NewsletterSection", settings: { title: "Join" } }];
    expect(popupVersion(a)).toBe(popupVersion(JSON.parse(JSON.stringify(a))));
    expect(popupVersion(a)).not.toBe(popupVersion([{ ...a[0], settings: { title: "Join us" } }]));
  });
});
