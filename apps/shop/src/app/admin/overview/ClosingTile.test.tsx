import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("../platformPlanApi", () => ({ usePlatformPlan: () => ({ plan: null, failed: false }) }));
import { ClosingTileView, closingDay } from "./ClosingTile";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const plan = (over: any) => ({ access: "open", cancelAtPeriodEnd: true, endsAt: "2026-12-12T12:00:00Z", ...over });

describe("Home's closing tile", () => {
  it("shows only while a cancel is waiting on an open shop", () => {
    expect(closingDay(plan({}) as any)).toBeTruthy();
    expect(closingDay(plan({ cancelAtPeriodEnd: false }) as any)).toBeNull();
    expect(closingDay(plan({ access: "closed" }) as any)).toBeNull();
    expect(closingDay(plan({ endsAt: null }) as any)).toBeNull();
    expect(closingDay(null)).toBeNull();
  });
  it("says the day and leads to Close your shop", () => {
    const html = renderToStaticMarkup(<ClosingTileView day="12 December 2026" />);
    expect(html).toContain("Your shop closes on 12 December 2026");
    expect(html.match(/#settings\/billing\/close/g)).toHaveLength(2);
  });
  it("is on Home", () => {
    expect(readFileSync(join(__dirname, "HomePage.tsx"), "utf8")).toContain("<ClosingTile />");
  });
});
