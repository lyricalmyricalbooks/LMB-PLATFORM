// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import type { GoogleStatus } from "../googleConnect";
import { readCopySwitch, sheetCounts, sheetDue, sheetState, sheetTabs } from "./sheets";
import { SheetsCard } from "./SheetsPage";
import type { StockroomRecords } from "./stockroomData";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-11T12:00:00Z");
const ready: GoogleStatus = { enabled: true, connected: true, extrasChosen: ["drive"] };
const records = (): StockroomRecords => ({
  books: [{ id: "salt", title: "Salt Almanac", currency: "CAD" }],
  states: {
    salt: {
      hist: [
        { date: "2026-11-01", qty: 2, price: 18, chan: "Fair", num: "F-1" },
        { date: "2026-11-05", qty: 1, price: 18, chan: "Website", num: "W-2" },
        { date: "2026-11-03", qty: 1, price: 18, chan: "Fair", voided: true },
      ],
      expenses: [],
    },
  },
  taxCenter: null,
});

describe("sheet rules", () => {
  it("says what the Google link allows", () => {
    expect(sheetState(null)).toBe("off");
    expect(sheetState({ enabled: false })).toBe("off");
    expect(sheetState({ enabled: true, connected: false })).toBe("off");
    expect(sheetState({ ...ready, needsReconnect: true })).toBe("off");
    expect(sheetState({ ...ready, extrasChosen: [] })).toBe("nodrive");
    expect(sheetState(ready)).toBe("ready");
  });

  it("sends by itself only with the switch on, Drive on and the sheet over six hours old", () => {
    expect(sheetDue(ready, true, NOW)).toBe(true);
    expect(sheetDue(ready, false, NOW)).toBe(false);
    expect(sheetDue({ ...ready, extrasChosen: [] }, true, NOW)).toBe(false);
    expect(sheetDue({ ...ready, sheet: { writtenAt: new Date(NOW - 2 * HOUR).toISOString() } }, true, NOW)).toBe(false);
    expect(sheetDue({ ...ready, sheet: { writtenAt: new Date(NOW - 7 * HOUR).toISOString() } }, true, NOW)).toBe(true);
  });

  it("builds the Sales tab newest first, leaving voided sales out", () => {
    const { sales, expenses } = sheetTabs(records());
    expect(sales.map((l) => [l[0], l[2], l[6]])).toEqual([["2026-11-05", "W-2", 18], ["2026-11-01", "F-1", 36]]);
    expect(expenses).toEqual([]);
  });

  it("counts and reads the switch", () => {
    expect(sheetCounts({ rows: 1, sales: 2, expenses: null })).toBe("1 product · 2 sales · 0 costs");
    expect(sheetCounts(null)).toBe("");
    expect(readCopySwitch('{"copy":false}')).toBe(false);
    expect(readCopySwitch('{"copy":true}')).toBe(true);
    expect(readCopySwitch("not json")).toBe(true);
  });
});

async function draw(props: Partial<Parameters<typeof SheetsCard>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<SheetsCard records={records()} status={ready} now={() => NOW} loadCopy={async () => true} saveCopy={async () => {}} send={vi.fn()} {...props} />); });
  await act(async () => {});
  return host;
}

describe("Sheets page", () => {
  it("makes the sheet by itself the first time, with the stockroom's sales", async () => {
    const send = vi.fn(async () => ({ available: true, url: "https://docs.google.com/spreadsheets/d/x/edit", writtenAt: new Date(NOW).toISOString(), rows: 1, sales: 2, expenses: 0 }));
    const host = await draw({ send });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown as [{ sales: unknown[] }])[0].sales).toHaveLength(2);
    expect(host.textContent).toContain("Sent just now · 1 product · 2 sales · 0 costs");
    expect(host.querySelector('a[href="https://docs.google.com/spreadsheets/d/x/edit"]')).not.toBeNull();
  });

  it("leaves a recent sheet alone, and never sends by itself with the switch off", async () => {
    const send = vi.fn();
    await draw({ send, status: { ...ready, sheet: { url: "https://docs.google.com/spreadsheets/d/x/edit", writtenAt: new Date(NOW - HOUR).toISOString(), rows: 1 } } });
    await draw({ send, loadCopy: async () => false });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends Google's refusal back as words, and points to Settings when Drive is off", async () => {
    const host = await draw({ send: async () => { throw new Error("Couldn't reach Google just now."); } });
    expect(host.textContent).toContain("Try again");
    const off = await draw({ status: { ...ready, extrasChosen: [] } });
    expect(off.textContent).toContain("Switch on Google Drive");
    expect(off.textContent).toContain("Open Google settings");
  });
});
