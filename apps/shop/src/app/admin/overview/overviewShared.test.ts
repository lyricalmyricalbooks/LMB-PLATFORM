import { describe, expect, it, vi, beforeEach } from "vitest";
import { clearShared, sharedLoad, SHARED_MAX_AGE_MS } from "./overviewShared";

describe("Overview shared reads", () => {
  beforeEach(() => clearShared());

  it("keeps a read for five minutes across visits, then reads again", async () => {
    let n = 0;
    const load = () => Promise.resolve(++n);
    expect(await sharedLoad("carts", load, false, 1_000)).toBe(1);
    expect(await sharedLoad("carts", load, false, 1_000 + SHARED_MAX_AGE_MS - 1)).toBe(1);
    expect(await sharedLoad("carts", load, false, 1_000 + SHARED_MAX_AGE_MS)).toBe(2);
  });

  it("Try again (fresh) and Refresh (clearShared) read again at once", async () => {
    let n = 0;
    const load = () => Promise.resolve(++n);
    await sharedLoad("k", load, false, 0);
    expect(await sharedLoad("k", load, true, 1)).toBe(2);
    clearShared();
    expect(await sharedLoad("k", load, false, 2)).toBe(3);
  });

  it("never keeps a failed read", async () => {
    await sharedLoad("bad", () => Promise.reject(new Error("x")), false, 0).catch(() => {});
    await Promise.resolve();
    expect(await sharedLoad("bad", () => Promise.resolve("ok"), false, 1)).toBe("ok");
  });
});

const fetchMock = vi.fn();
vi.mock("../../../lib/firebase", () => ({ auth: { currentUser: { getIdToken: async () => "t" } }, db: {} }));
vi.mock("../../lib/functionsBase", () => ({ functionFetch: (...a: unknown[]) => fetchMock(...a) }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }));

describe("Google Analytics report memory", () => {
  const range = { startDate: "2026-10-01", endDate: "2026-10-20", prevStartDate: "2026-09-11", prevEndDate: "2026-09-30" };
  const answer = (body: unknown) => ({ ok: true, json: async () => body });

  it("asks the server once per range for five minutes; Refresh forgets", async () => {
    const { googleAnalyticsApi, forgetReports, REPORT_MAX_AGE_MS } = await import("../googleAnalytics");
    forgetReports(); fetchMock.mockReset();
    fetchMock.mockResolvedValue(answer({ connected: true }));
    await googleAnalyticsApi.report(range, 0);
    await googleAnalyticsApi.report(range, REPORT_MAX_AGE_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await googleAnalyticsApi.report({ ...range, startDate: "2026-10-02" }, 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await googleAnalyticsApi.report(range, REPORT_MAX_AGE_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    forgetReports();
    await googleAnalyticsApi.report(range, REPORT_MAX_AGE_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("never keeps no_property, and saving settings forgets reports and shared reads", async () => {
    const { googleAnalyticsApi, forgetReports } = await import("../googleAnalytics");
    forgetReports(); fetchMock.mockReset();
    fetchMock.mockResolvedValue(answer({ connected: false, code: "no_property" }));
    await googleAnalyticsApi.report(range, 0);
    await new Promise(r => setTimeout(r, 0));
    await googleAnalyticsApi.report(range, 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockResolvedValue(answer({ connected: true }));
    await googleAnalyticsApi.report(range, 2);
    await googleAnalyticsApi.report(range, 3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    let n = 0;
    await sharedLoad("sc", () => Promise.resolve(++n), false, 3);
    await googleAnalyticsApi.save("G-ABC123", "123");
    await googleAnalyticsApi.report(range, 4);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(await sharedLoad("sc", () => Promise.resolve(++n), false, 4)).toBe(2);
    await googleAnalyticsApi.saveSearchConsoleSite("sc-domain:x.com");
    expect(await sharedLoad("sc", () => Promise.resolve(++n), false, 5)).toBe(3);
  });

  it("does not keep an error answer or a failed call", async () => {
    const { googleAnalyticsApi, forgetReports } = await import("../googleAnalytics");
    forgetReports(); fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(answer({ connected: false, code: "api_disabled", error: "x" }));
    await googleAnalyticsApi.report(range, 0);
    await new Promise(r => setTimeout(r, 0));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await googleAnalyticsApi.report(range, 1).catch(() => {});
    await new Promise(r => setTimeout(r, 0));
    fetchMock.mockResolvedValueOnce(answer({ connected: true }));
    expect((await googleAnalyticsApi.report(range, 2)).connected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
