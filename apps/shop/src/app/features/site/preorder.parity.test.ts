import { describe, it, expect } from "vitest";
import * as client from "./preorder";
// @ts-ignore - the Functions' generated CommonJS copy (scripts/build-shared.mjs)
import * as server from "../../../../functions/shared/preorder.js";
const srv: any = (server as any).default ?? server;

// 2026-10-08 noon in Toronto.
const now = new Date("2026-10-08T16:00:00Z");

const books = [
  { preorder: true, publishDate: "2026-11-12" },
  { preorder: true, publishDate: "2026-10-08" }, // release day: on sale normally
  { preorder: true, publishDate: "2026-10-09" },
  { preorder: true, publishDate: "" }, // date to be announced
  { preorder: true, publishDate: "not a date" },
  { preorder: false, publishDate: "2027-01-01" },
  { publishDate: "2027-01-01" },
  null,
];

describe("pre-order rule (client ↔ server parity)", () => {
  it("agrees on which books are on pre-order", () => {
    for (const b of books) expect(client.preorderActive(b, now)).toBe(srv.preorderActive(b, now));
    expect(books.map((b) => client.preorderActive(b, now))).toEqual([true, false, true, true, true, false, false, false]);
  });

  it("uses the Toronto calendar day, not UTC", () => {
    // 2026-10-09 02:00 UTC is still 8 Oct in Toronto: a 9 Oct release is still a pre-order.
    const lateEvening = new Date("2026-10-09T02:00:00Z");
    expect(client.preorderActive({ preorder: true, publishDate: "2026-10-09" }, lateEvening)).toBe(true);
    expect(srv.preorderActive({ preorder: true, publishDate: "2026-10-09" }, lateEvening)).toBe(true);
  });

  it("server order lines always carry an explicit flag (a browser flag never sticks)", () => {
    expect(srv.preorderLine({ preorder: true, publishDate: "2026-11-12" }, now)).toEqual({ preorder: true, releaseDate: "2026-11-12" });
    expect(srv.preorderLine({ preorder: true }, now)).toEqual({ preorder: true, releaseDate: null });
    expect(srv.preorderLine({ preorder: false }, now)).toEqual({ preorder: false, releaseDate: null });
  });

  const order = {
    items: [
      { title: "Paper", preorder: true, releaseDate: "2026-11-12", format: "Paperback" },
      { title: "Later", preorder: true, releaseDate: "2026-12-01" },
      { title: "Ebook", preorder: true, releaseDate: "2027-02-01", digital: true },
      { title: "Shelf", preorder: false, releaseDate: null },
    ],
  };

  it("holds the parcel for physical pre-orders until the latest release", () => {
    const c = client.waitingPreorderLines(order, {}, now);
    const s = srv.waitingPreorderLines(order, {}, now);
    expect(c.map((i: any) => i.title)).toEqual(["Paper", "Later"]);
    expect(s.map((i: any) => i.title)).toEqual(["Paper", "Later"]);
    expect(client.shipDateOf(c)).toBe("2026-12-01");
    expect(srv.shipDateOf(s)).toBe("2026-12-01");
  });

  it("releases once the date passes or the publisher ships early", () => {
    expect(client.waitingPreorderLines(order, {}, new Date("2026-12-02T16:00:00Z"))).toEqual([]);
    expect(srv.waitingPreorderLines(order, {}, new Date("2026-12-02T16:00:00Z"))).toEqual([]);
    expect(client.waitingPreorderLines(order, { preorderReleased: true }, now)).toEqual([]);
    expect(srv.waitingPreorderLines(order, { preorderReleased: true }, now)).toEqual([]);
  });

  it("an unannounced date has no ship date", () => {
    const tba = { items: [{ preorder: true, releaseDate: null }, { preorder: true, releaseDate: "2026-11-01" }] };
    expect(client.shipDateOf(client.waitingPreorderLines(tba, {}, now))).toBe("");
    expect(srv.shipDateOf(srv.waitingPreorderLines(tba, {}, now))).toBe("");
  });

  it("email lines explain release and shipping", () => {
    const lines = srv.preorderEmailLines(order, now);
    expect(lines[0]).toContain("Paper");
    expect(lines.join(" ")).toContain("2026-12-01");
    expect(lines.join(" ")).toContain("Digital pre-orders");
    expect(srv.preorderEmailLines({ items: [{ preorder: false }] }, now)).toEqual([]);
  });

  it("formats release dates without a timezone shift", () => {
    expect(client.formatReleaseDate("2026-11-12", "en-CA")).toContain("12");
    expect(client.formatReleaseDate("", "en-CA")).toBe("");
  });
});
