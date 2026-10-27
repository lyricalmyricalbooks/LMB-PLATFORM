import { beforeEach, describe, expect, it } from "vitest";
import { dailyTrafficBetween, forgetDailyTraffic } from "./dailyTrafficCache";

const day = (key: string) => Date.parse(`${key}T12:00:00Z`);
const keys = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

// Days with a doc: every day except 2026-10-05 (no visitors). Values change per read, to spot stale copies.
function store() {
  let version = 0;
  const calls: [string, string][] = [];
  const fetch = async (from: string, to: string) => {
    calls.push([from, to]);
    version += 1;
    return keys(from, to).filter(k => k !== "2026-10-05").map(k => ({ id: k, date: k, visits: version }));
  };
  return { fetch, calls };
}

describe("dailyTrafficBetween", () => {
  beforeEach(() => forgetDailyTraffic());

  it("returns exactly what a plain read returns", async () => {
    const s = store();
    const rows = await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(rows.map(r => r.id)).toEqual(keys("2026-10-01", "2026-10-20").filter(k => k !== "2026-10-05"));
  });

  it("reads only the last few days again on the next open", async () => {
    const s = store();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    const rows = await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls[1]).toEqual(["2026-10-18", "2026-10-20"]);
    expect(rows.find(r => r.id === "2026-10-10")?.visits).toBe(1); // settled: kept
    expect(rows.find(r => r.id === "2026-10-19")?.visits).toBe(2); // still writable: read again
    expect(rows.map(r => r.id)).toEqual(keys("2026-10-01", "2026-10-20").filter(k => k !== "2026-10-05"));
  });

  it("a shorter range inside what is on hand reads only its recent days", async () => {
    const s = store();
    await dailyTrafficBetween("2026-09-01", "2026-10-20", s.fetch, day("2026-10-20"));
    const rows = await dailyTrafficBetween("2026-10-10", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls[1]).toEqual(["2026-10-18", "2026-10-20"]);
    expect(rows[0].id).toBe("2026-10-10");
    expect(rows).toHaveLength(11);
  });

  it("a longer range reads only the older days it is missing", async () => {
    const s = store();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    const rows = await dailyTrafficBetween("2026-09-01", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls.slice(1).sort()).toEqual([["2026-09-01", "2026-09-30"], ["2026-10-18", "2026-10-20"]]);
    expect(rows.map(r => r.id)).toEqual(keys("2026-09-01", "2026-10-20").filter(k => k !== "2026-10-05"));
  });

  it("days that settled during a long session are read once more, then kept", async () => {
    const s = store();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    const rows = await dailyTrafficBetween("2026-10-02", "2026-10-22", s.fetch, day("2026-10-22"));
    expect(s.calls[1]).toEqual(["2026-10-18", "2026-10-22"]);
    expect(rows.map(r => r.id)).toEqual(keys("2026-10-02", "2026-10-22").filter(k => k !== "2026-10-05"));
    await dailyTrafficBetween("2026-10-02", "2026-10-22", s.fetch, day("2026-10-22"));
    expect(s.calls[2]).toEqual(["2026-10-20", "2026-10-22"]);
  });

  it("a range far away from what is on hand is read whole", async () => {
    const s = store();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    await dailyTrafficBetween("2025-10-01", "2025-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls[1]).toEqual(["2025-10-01", "2025-10-20"]);
  });

  it("forgets everything after the counts are reset", async () => {
    const s = store();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    forgetDailyTraffic();
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls[1]).toEqual(["2026-10-01", "2026-10-20"]);
  });

  it("a read that finishes after a reset is not kept", async () => {
    const s = store();
    let release: () => void = () => {};
    const slow = (from: string, to: string) => new Promise<any[]>(r => { release = () => r(s.fetch(from, to)); });
    const pending = dailyTrafficBetween("2026-10-01", "2026-10-20", slow as any, day("2026-10-20"));
    forgetDailyTraffic();
    release();
    await pending;
    await dailyTrafficBetween("2026-10-01", "2026-10-20", s.fetch, day("2026-10-20"));
    expect(s.calls[1]).toEqual(["2026-10-01", "2026-10-20"]);
  });
});
