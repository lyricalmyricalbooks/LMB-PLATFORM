import { describe, expect, it } from "vitest";
import { cleanVisit, droppedPhotos, ownPhotoPath, photoFileName, sortVisits, MAX_VISIT_PHOTOS, type ClientVisit } from "./clientVisits";

const client = "a".repeat(64);
const path = (n: string) => `client-photos/${client}/${n}`;
const base = { client, email: "Ada@Example.com", day: "2026-11-17", note: "  7/1 + 20 vol, 35 min  ", photos: [] };

describe("visit notes and photos", () => {
  it("keeps a trimmed note, a lower-case email and only the client's own photos", () => {
    const out = cleanVisit({ ...base, photos: [
      { path: path("before-1.jpg"), kind: "before" },
      { path: path("before-1.jpg"), kind: "before" },
      { path: `client-photos/${"b".repeat(64)}/x.jpg`, kind: "after" },
      { path: "products/x.jpg", kind: "after" },
      { path: path("../escape.jpg"), kind: "after" },
      { path: path("after-2.jpg"), kind: "sideways" as never },
    ] });
    expect(out).toEqual({ visit: { client, email: "ada@example.com", day: "2026-11-17", note: "7/1 + 20 vol, 35 min", photos: [{ path: path("before-1.jpg"), kind: "before" }] } });
  });

  it("refuses an empty visit, a bad day, a long note, too many photos and an unknown client", () => {
    expect(cleanVisit({ ...base, note: " " })).toEqual({ problem: "Add a note or a photo." });
    expect(cleanVisit({ ...base, day: "2026-13-45" })).toEqual({ problem: "Pick the day of the visit." });
    expect(cleanVisit({ ...base, day: "" })).toEqual({ problem: "Pick the day of the visit." });
    expect("problem" in cleanVisit({ ...base, note: "x".repeat(4001) })).toBe(true);
    const many = Array.from({ length: MAX_VISIT_PHOTOS + 1 }, (_, i) => ({ path: path(`p${i}.jpg`), kind: "after" as const }));
    expect(cleanVisit({ ...base, photos: many })).toEqual({ problem: `Up to ${MAX_VISIT_PHOTOS} photos a visit.` });
    expect(cleanVisit({ ...base, client: "nope" })).toEqual({ problem: "Unknown client." });
    // A photo on its own is a visit.
    expect("visit" in cleanVisit({ ...base, note: "", photos: [{ path: path("a.jpg"), kind: "after" }] })).toBe(true);
  });

  it("only ever names files in the client's own folder", () => {
    expect(ownPhotoPath(client, path("after-1-x.jpg"))).toBe(true);
    expect(ownPhotoPath(client, path("sub/a.jpg"))).toBe(false);
    expect(ownPhotoPath(client, `client-photos/${client}/`)).toBe(false);
    expect(ownPhotoPath("short", "client-photos/short/a.jpg")).toBe(false);
  });

  it("lists the newest visit first and finds the photos a save took off", () => {
    const v = (id: string, day: string, createdAt: string) => ({ id, day, createdAt } as ClientVisit);
    expect(sortVisits([v("a", "2026-10-01", "1"), v("b", "2026-11-01", "1"), v("c", "2026-11-01", "2")]).map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(droppedPhotos([{ path: "x", kind: "before" }, { path: "y", kind: "after" }], [{ path: "y", kind: "after" }])).toEqual(["x"]);
    expect(photoFileName("before", 5, "a-b_c!d")).toBe("before-5-abcd.jpg");
    expect(photoFileName("after", 5, "!!")).toBe("after-5-x.jpg");
  });
});
