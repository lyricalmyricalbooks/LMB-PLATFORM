import { describe, expect, it } from "vitest";
import { announcementOps } from "./StudioAnnouncements";

describe("announcement message list", () => {
  it("adds, edits, reorders and removes messages, dropping blank optional fields", () => {
    let list = announcementOps.add([], "Free shipping over $50");
    list = announcementOps.add(list, "New zine out");
    const [a, b] = list;
    expect(a.text).toBe("Free shipping over $50");
    expect(a.id).not.toBe(b.id);
    list = announcementOps.update(list, b.id, { link: "/collections/zines", from: "2026-10-01" });
    expect(list[1]).toEqual({ id: b.id, text: "New zine out", link: "/collections/zines", from: "2026-10-01" });
    list = announcementOps.update(list, b.id, { link: "" });
    expect(list[1]).not.toHaveProperty("link");
    list = announcementOps.move(list, b.id, -1);
    expect(list.map(m => m.id)).toEqual([b.id, a.id]);
    expect(announcementOps.move(list, b.id, -1)).toBe(list);
    expect(announcementOps.remove(list, b.id).map(m => m.id)).toEqual([a.id]);
  });
});
