import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadinessPanel } from "./OverviewParts";

describe("ReadinessPanel", () => {
  it("shows unknown readiness with a retry after a source read fails", () => {
    const html = renderToStaticMarkup(<ReadinessPanel error items={null} onRetry={() => {}} onOpen={() => {}} />);
    expect(html).toContain("Launch checks unavailable");
    expect(html).toContain("Readiness is unknown");
    expect(html).toContain("Try again");
  });
  it("keeps deployment checks actionable through an external link", () => {
    const html = renderToStaticMarkup(<ReadinessPanel error={false} items={[{ id: "deployment", status: "warn", label: "Deployment unverified", detail: "Review release", tab: "general", action: "Check deployments", href: "https://example.com/releases" }]} onRetry={() => {}} onOpen={() => {}} />);
    expect(html).toContain('href="https://example.com/releases"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Check deployments");
  });
});

import { StatRow, BarRow, DrillList } from "./OverviewParts";

describe("drill-down rows", () => {
  it("a row with details is a closed disclosure button; without, a plain line", () => {
    const html = renderToStaticMarkup(<ul><StatRow label="Carts" value={4} details={<p>inside</p>} /><BarRow label="Mon" value={1} share={50} details={<p>x</p>} /><StatRow label="Plain" value={1} /></ul>);
    expect(html.match(/aria-expanded="false"/g)?.length).toBe(2);
    expect(html).not.toContain("inside");
  });
  it("lists the first items, links them, and offers Show all", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ key: String(i), title: `Order ${i}`, href: `#orders/${i}`, value: "CA$1" }));
    const html = renderToStaticMarkup(<DrillList label="Orders" items={items} limit={3} />);
    expect(html.match(/<li/g)?.length).toBe(3);
    expect(html).toContain('href="#orders/0"');
    expect(html).toContain("Show all 10");
    expect(renderToStaticMarkup(<DrillList label="x" items={[]} empty="None here" />)).toContain("None here");
  });
});

import { money, moneyFigure, moneyShort, Trend, RunList, RunRow, ReadinessStrip } from "./OverviewParts";

describe("money formats", () => {
  it("lists always show two decimals", () => {
    expect(money(30.6)).toBe("CA$30.60"); expect(money(200)).toBe("CA$200.00"); expect(money(0)).toBe("CA$0.00");
  });
  it("big figures drop cents from CA$1,000", () => {
    expect(moneyFigure(1240.5)).toBe("CA$1,241"); expect(moneyFigure(84.5)).toBe("CA$84.50");
  });
  it("chart labels are short", () => {
    expect(moneyShort(681.4)).toBe("$681"); expect(moneyShort(1200)).toBe("$1.2k"); expect(moneyShort(1000)).toBe("$1k");
    expect(moneyShort(12400)).toBe("$12k"); expect(moneyShort(-50)).toBe("−$50");
  });
});

describe("Trend", () => {
  it("shows one mark and says up/down", () => {
    const up = renderToStaticMarkup(<Trend now={110} before={100} />);
    expect(up).toContain("▲"); expect(up).not.toContain("✓"); expect(up).toContain("up "); expect(up).toContain('data-tone="success"');
    const down = renderToStaticMarkup(<Trend now={90} before={100} goodWhen="down" />);
    expect(down).toContain("▼"); expect(down).toContain('data-tone="success"');
    expect(renderToStaticMarkup(<Trend now={90} before={100} goodWhen="neutral" />)).toContain('data-tone="neutral"');
  });
});

describe("RunList", () => {
  it("lists only lines with something to do, then one All clear line", () => {
    const html = renderToStaticMarkup(<RunList>
      <RunRow label="orders to ship" detail="d" count={2} loading={false} onOpen={() => {}} openLabel="Ship" />
      <RunRow label="reviews to moderate" detail="d" count={0} loading={false} onOpen={() => {}} openLabel="Go" />
      <RunRow label="unread messages" detail="d" count={0} loading={false} onOpen={() => {}} openLabel="Go" />
    </RunList>);
    expect(html).toContain("orders to ship");
    expect(html).toContain("No reviews to moderate, unread messages.");
    expect(html.match(/<li/g)?.length).toBe(2);
  });

  it("reads a count of 1 in the singular, keeps the plural otherwise and in the All clear line", () => {
    const row = (count: number) => renderToStaticMarkup(
      <RunRow label="reviews to moderate" one="review to moderate" detail="Readers are waiting to see these" detailOne="A reader is waiting to see it"
        count={count} loading={false} onOpen={() => {}} openLabel="Go" />);
    expect(row(1)).toContain("review to moderate<");
    expect(row(1)).toContain("A reader is waiting to see it");
    expect(row(2)).toContain("reviews to moderate<");
    expect(row(2)).toContain("Readers are waiting to see these");
    const clear = renderToStaticMarkup(<RunList><RunRow label="reviews to moderate" one="review to moderate" detail="d" count={0} loading={false} onOpen={() => {}} openLabel="Go" /></RunList>);
    expect(clear).toContain("No reviews to moderate.");
  });

  it("gives every Needs you line on the Overview a singular wording", () => {
    const src = readFileSync(new URL("./AnalyticsDashboard.tsx", import.meta.url), "utf8");
    const rows = src.match(/<RunRow [^>]*?label="[^"]+"[^>]*/g) || [];
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r).toMatch(/ one="[^"]+"/);
  });
});

describe("ReadinessStrip", () => {
  it("shows blocking checks first and folds the rest", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `w${i}`, status: "warn" as const, label: `Check ${i}`, detail: "", tab: "general", action: "Open" })),
      { id: "b", status: "block" as const, label: "Stripe keys", detail: "", tab: "payments", action: "Fix" },
    ];
    const html = renderToStaticMarkup(<ReadinessStrip items={items as any} onOpen={() => {}} />);
    expect(html).toContain("Stripe keys"); expect(html).not.toContain("Check 0"); expect(html).toContain("+5 more to check");
  });
});

import { ChangeList } from "./OverviewParts";

describe("What changed list", () => {
  it("lays every line out as a title column beside one badge, so titles line up whatever the mix of moves", () => {
    const html = renderToStaticMarkup(<ChangeList changes={[
      { id: "a", tone: "up", title: "Revenue rose by 31%", detail: "CA$420.00 now", weight: 1 } as any,
      { id: "b", tone: "down", title: "Sales of Tidal Notes fell", detail: "CA$60.00 now", weight: 1 } as any,
    ]} />);
    expect(html).toContain('aria-label="What changed"');
    expect(html.match(/class="rp-ov-change"/g)).toHaveLength(2);
    expect(html).toContain("▲ Up");
    expect(html).toContain("▼ Down");
    expect(html.indexOf("Revenue rose by 31%")).toBeLessThan(html.indexOf("▲ Up"));
  });
});
