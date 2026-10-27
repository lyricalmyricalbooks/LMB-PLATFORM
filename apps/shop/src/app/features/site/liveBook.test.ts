import { expect, it } from "vitest";
import { isLiveBook } from "./liveBook";

it("hides drafts, archived and not-yet-released books", () => {
  const now = "2026-10-06T12:00:00.000Z";
  expect(isLiveBook({ status: "published" }, now)).toBe(true);
  expect(isLiveBook({}, now)).toBe(true);
  expect(isLiveBook({ status: "draft" }, now)).toBe(false);
  expect(isLiveBook({ status: "archived" }, now)).toBe(false);
  expect(isLiveBook({ status: "published", scheduleDate: "2026-10-07" }, now)).toBe(false);
  expect(isLiveBook({ status: "published", scheduleDate: "2026-10-06" }, now)).toBe(true);
});

import { applyBackorderPolicy } from "./backorder";
it("books with inventory tracking off, or editions on backorder, are not shown as sold out", () => {
  expect((applyBackorderPolicy({ trackInventory: false, stockLevel: 0 } as any) as any).stockLevel).toBe(999);
  const b: any = applyBackorderPolicy({ trackInventory: true, allowBackorder: true, stockLevel: 0, variants: [{ id: "a", stock: 0 }] } as any);
  expect(b.stockLevel).toBe(999);
  expect(b.variants[0].onBackorder).toBe(true);
  expect((applyBackorderPolicy({ trackInventory: true, stockLevel: 0 } as any) as any).stockLevel).toBe(0);
});

import { releaseArrived } from "./liveBook";
it("a plain release date starts that day in Toronto, not at midnight UTC", () => {
  // 8:30pm Toronto on Oct 7 is already Oct 8 in UTC: the Oct 8 release isn't out yet.
  expect(isLiveBook({ status: "published", scheduleDate: "2026-10-08" }, "2026-10-08T00:30:00.000Z")).toBe(false);
  // 12:30am Toronto on Oct 8.
  expect(isLiveBook({ status: "published", scheduleDate: "2026-10-08" }, "2026-10-08T04:30:00.000Z")).toBe(true);
  expect(releaseArrived("2026-10-08T12:00:00.000Z", "2026-10-08T11:00:00.000Z")).toBe(false);
  expect(releaseArrived(undefined)).toBe(true);
});
