import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import {
  JOURNEY_MAX_DAYS, bigQueryDatasetProblem, cleanBigQueryDataset, exitRows, exitsHeadline, journeyFoot, journeyRows, journeysHeadline, journeyWindow,
} from "./bigQueryJourneys";

const server = createRequire(import.meta.url)("../../../functions/bigQueryJourneys.js");

// Settings checks the dataset name before saving; the server checks it again before writing it into the SQL. Same answers.
describe("BigQuery dataset rules match the server", () => {
  const names = ["analytics_123456789", "my-project.analytics_1", "my-project:ga", "`my-project.ga`", "", "  ", "a.b.c", "Proj.ds", "x.ds",
    "my-project-.ds", "ds; DROP TABLE x", "ds`", "my project.ds", "1abcde.ds", "my-project.ds-x", "abcdef.", ".ds", "a".repeat(1025)];
  it("agrees on every name", () => {
    for (const n of names) {
      expect(cleanBigQueryDataset(n), n).toBe(server.cleanBigQueryDataset(n));
      expect(bigQueryDatasetProblem(n), n).toBe(server.bigQueryDatasetProblem(n));
    }
  });
  it("agrees on the longest period", () => {
    expect(JOURNEY_MAX_DAYS).toBe(server.MAX_DAYS);
  });
});

describe("journey window", () => {
  it("keeps a short range as it is", () => {
    expect(journeyWindow({ startKey: "2026-10-14", endKey: "2026-10-20" })).toMatchObject({ startDate: "2026-10-14", endDate: "2026-10-20", clamped: false, days: 7 });
  });
  it("cuts a long range to its last 31 days and says so", () => {
    const w = journeyWindow({ startKey: "2026-07-23", endKey: "2026-10-20" });
    expect(w).toMatchObject({ startDate: "2026-09-20", endDate: "2026-10-20", clamped: true, days: 31 });
    expect(server.cleanJourneyRange({ startDate: w.startDate, endDate: w.endDate })).not.toBeNull();
    expect(journeyFoot(w, "the last 90 days")).toMatch(/last 31 days of the last 90 days/);
    expect(journeyFoot(journeyWindow({ startKey: "2026-10-14", endKey: "2026-10-20" }), "the last 7 days")).not.toMatch(/31/);
  });
});

const books = [{ id: "b1", slug: "salt", title: "Salt" }];

describe("journey rows", () => {
  const answer = {
    connected: true,
    journeys: [
      { steps: ["/", "/books/salt", "/page/about", "/cart"], sessions: 12, purchases: 3 },
      { steps: ["/", "/books/salt"], sessions: 40, purchases: 5 },
      { steps: ["/"], sessions: 99, purchases: 0 },
    ],
    exits: [{ path: "/books/salt", sessions: 30, hadBag: 9, purchases: 2 }, { path: "/", sessions: 55, hadBag: 0 }],
    totals: { sessions: 140, onePage: 70, purchases: 8 },
  };
  it("names pages the way the other visitor widgets do, most visits first", () => {
    const rows = journeyRows(answer, books)!;
    expect(rows.map(r => r.labels)).toEqual([["Home", "Salt"], ["Home", "Salt", "About", "Bag"]]);
    expect(rows[0]).toMatchObject({ sessions: 40, purchases: 5, buyShare: 5 / 40 });
    expect(journeysHeadline(rows, answer.totals)).toBe("The most common path is Home → Salt (40 visits). 50% of visits saw only one page.");
  });
  it("ranks exit pages with the share that had something in the bag", () => {
    const rows = exitRows(answer, books)!;
    expect(rows.map(r => r.label)).toEqual(["Home", "Salt"]);
    expect(rows[1]).toMatchObject({ sessions: 30, hadBag: 9, bagShare: 0.3, share: 30 / 140, purchases: 2 });
    expect(exitsHeadline(rows)).toBe("Most visits end on Home: 55 visits (39% of all).");
    expect(exitsHeadline([rows[1]])).toMatch(/30% of them with something in the bag/);
  });
  it("returns null when nothing was recorded, never a made-up zero", () => {
    expect(journeyRows({ connected: true, journeys: [] }, books)).toBeNull();
    expect(exitRows({ connected: true }, books)).toBeNull();
    expect(journeyRows(null, books)).toBeNull();
  });
});
