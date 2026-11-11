// @vitest-environment jsdom
// Stockroom › Backups: the rows' words, the one list as the mockup shows it, Back up now, and the stock counts file.
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));
vi.mock("react-hot-toast", () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const { folderRow, nightlyRow, whenWords } = await import("./backups");
const { nightlyBackupApi } = await import("../BackupsExportCard");
const { BackupsPage, stockCountsFile } = await import("./BackupsPage");

const at = (d: string) => new Date(d).getTime();

describe("backup row words", () => {
  it("says when, in the press's own words", () => {
    const now = at("2026-11-11T12:00:00");
    expect(whenWords("2026-11-11T03:17:00", now)).toMatch(/^Last night, /);
    expect(whenWords("2026-11-11T10:42:00", now)).toMatch(/^Today, /);
    expect(whenWords("2026-11-10T22:05:00", now)).toMatch(/^Last night, /);
    expect(whenWords("2026-11-10T14:05:00", now)).toMatch(/^Yesterday, /);
    expect(whenWords("2026-11-02T03:17:00", now)).not.toMatch(/night|Today|Yesterday/);
    expect(whenWords("", now)).toBe("");
  });

  it("names the nightly row by its last good backup, or says when the first one runs", () => {
    const now = at("2026-11-11T12:00:00");
    expect(nightlyRow({ lastSuccessAt: "2026-11-11T03:17:00" }, now)).toMatchObject({ sub: "Every night · kept 30 days" });
    expect(nightlyRow(null, now)).toEqual({ name: "Every night", sub: "The first one runs tonight" });
  });

  it("tells the folder row's state", () => {
    expect(folderRow({ lastAt: null, folder: null }, false).label).toBe("Not here");
    expect(folderRow({ lastAt: null, folder: null }, true).label).toBe("Off");
    const on = folderRow({ lastAt: "2026-11-11T09:00:00", folder: "Shop backups" }, true, at("2026-11-11T12:00:00"));
    expect(on.label).toBe("On");
    expect(on.sub).toMatch(/^Shop backups · last copy today, /);
  });
});

describe("Stockroom › Backups", () => {
  let el: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  afterEach(() => { act(() => root?.unmount()); el?.remove(); });

  it("shows the one Backups list and backs up now", async () => {
    nightlyBackupApi.status = vi.fn(async () => ({ ok: true, lastSuccessAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString() }));
    nightlyBackupApi.list = vi.fn(async () => ({ backups: [] }));
    nightlyBackupApi.backupNow = vi.fn(async () => ({ ok: true }));
    el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(<BackupsPage />); });
    const text = el.textContent || "";
    expect(el.querySelector("h2")?.textContent).toBe("Backups");
    for (const line of ["Every night · kept 30 days", "Download all your data", "Spreadsheet files and one zip", "Back up to a folder", "Spreadsheets"]) expect(text).toContain(line);
    const now = [...el.querySelectorAll("button")].find((b) => b.textContent === "Back up now")!;
    await act(async () => { now.click(); });
    expect(nightlyBackupApi.backupNow).toHaveBeenCalledTimes(1);
    expect(nightlyBackupApi.status).toHaveBeenCalledTimes(2);
  });

  it("makes the stock counts file from real books only, and nothing when there are none", async () => {
    const load = async () => ({ books: [{ id: "salt", title: "Salt Almanac" }, { id: "test-book", title: "Test", isTest: true }], states: { salt: { inv: 4 }, "test-book": { inv: 2 } }, taxCenter: null });
    const file = await stockCountsFile(load);
    expect(file?.[0]).toMatch(/^stock-counts-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file?.[1]).toContain("Salt Almanac");
    expect(file?.[1]).not.toContain("Test");
    expect(await stockCountsFile(async () => ({ books: [], states: {}, taxCenter: null }))).toBeNull();
  });
});
