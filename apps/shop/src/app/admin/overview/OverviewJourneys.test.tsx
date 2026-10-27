// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const bigQueryJourneys = vi.fn();
vi.mock("../googleAnalytics", () => ({ googleAnalyticsApi: { bigQueryJourneys: (...a: any[]) => bigQueryJourneys(...a) } }));
const { OverviewJourneys } = await import("./OverviewJourneys");
const { __forgetJourneys } = await import("../bigQueryJourneys");

let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.replaceChildren(container); bigQueryJourneys.mockReset(); __forgetJourneys(); });

const ANSWER = {
  connected: true, dataset: "p.analytics_1",
  journeys: [{ steps: ["/", "/books/salt", "/page/about", "/cart"], sessions: 12, purchases: 3 }],
  exits: [{ path: "/books/salt", sessions: 30, hadBag: 9 }],
  totals: { sessions: 100, onePage: 40, purchases: 3 },
};
const books = [{ id: "b1", slug: "salt", title: "Salt" }] as any;
const range = { startKey: "2026-07-23", endKey: "2026-10-20", phrase: "the last 90 days" };

async function render(node: React.ReactNode) {
  const root = createRoot(container);
  await act(async () => root.render(node));
  await act(async () => {});
  return root;
}

it("asks for the last 31 days of the range and draws the paths", async () => {
  bigQueryJourneys.mockResolvedValue(ANSWER);
  await render(<OverviewJourneys only="journeys" books={books} range={range} />);
  expect(bigQueryJourneys).toHaveBeenCalledWith("2026-09-20", "2026-10-20");
  expect(container.textContent).toContain("Home → Salt → About → Bag");
  expect(container.textContent).toContain("12 visits");
  expect(container.textContent).toContain("3 ended in a purchase");
  expect(container.textContent).toMatch(/last 31 days of the last 90 days/);
});

it("ranks exit pages with the bag share", async () => {
  bigQueryJourneys.mockResolvedValue(ANSWER);
  await render(<OverviewJourneys only="exitPages" books={books} range={range} />);
  expect(container.textContent).toContain("Most visits end on Salt");
  expect(container.textContent).toContain("30% had something in the bag");
});

it("explains an unlinked export and opens the settings", async () => {
  bigQueryJourneys.mockResolvedValue({ connected: false, code: "not_linked", error: "No Google Analytics export was found in BigQuery." });
  const setActiveTab = vi.fn();
  await render(<OverviewJourneys only="journeys" books={books} range={range} setActiveTab={setActiveTab} />);
  expect(container.textContent).toContain("The BigQuery export isn't linked yet");
  const open = Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Open Google Analytics settings")!;
  await act(async () => open.click());
  expect(setActiveTab).toHaveBeenCalledWith("general");
});

it("asks BigQuery once when both journey widgets open on the same range", async () => {
  bigQueryJourneys.mockResolvedValue({ connected: true, journeys: [], exits: [], totals: { sessions: 0, onePage: 0, purchases: 0 } });
  const range = { startKey: "2026-10-01", endKey: "2026-10-14", phrase: "these two weeks" };
  await act(async () => {
    createRoot(container).render(<><OverviewJourneys only="journeys" books={[]} range={range} /><OverviewJourneys only="exitPages" books={[]} range={range} /></>);
  });
  expect(bigQueryJourneys).toHaveBeenCalledTimes(1);
});
