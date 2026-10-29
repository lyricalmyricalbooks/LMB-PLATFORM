// Connect Google (plan 6.17) in the admin: the platform's answer is read safely, every part is named in plain words,
// and once the platform writes the measurement ID into the shop's settings, the shop's tag starts, only with consent.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase", () => ({ auth: { currentUser: null }, db: {} }));
vi.mock("../lib/trackingGuard", () => ({ googleTrackingAllowed: vi.fn(async () => true) }));
import { GOOGLE_PARTS, readGoogleStatus, readShoppingProblems, readStockSheet, stepWord } from "./googleConnect";
import { __resetGa4ForTests, configureGa4, ga4PageView } from "../lib/ga4";
import { CONSENT_KEY } from "../lib/consent";

describe("reading the Google link's answer", () => {
  it("anything but a switched-on answer is 'not on yet'", () => {
    expect(readGoogleStatus(null)).toEqual({ enabled: false });
    expect(readGoogleStatus({ enabled: "yes" })).toEqual({ enabled: false });
  });
  it("keeps known parts and states only", () => {
    const status = readGoogleStatus({
      enabled: true, connected: true, accountEmail: "owner@example.com",
      extrasOffered: ["drive", "photos"], extrasChosen: ["drive"],
      steps: [{ step: "analytics", state: "done", detail: "Visits are counted." }, { step: "x", state: "odd" }, null],
    });
    expect(status.extrasOffered).toEqual(["drive"]);
    expect(status.steps).toEqual([{ step: "analytics", state: "done", detail: "Visits are counted.", at: undefined }]);
    expect(stepWord("failed")).toBe("Didn't work");
  });
  it("names every part in plain words", () => {
    const words = Object.values(GOOGLE_PARTS).map((p) => `${p.label} ${p.about}`).join(" ");
    for (const banned of [/Firebase/, /\bAPI\b/, /OAuth/i, /\bproperty\b/i, /\bkey\b/i, /\bDNS\b/, /webhook/i, /secret/i, /deploy/i, /Google Cloud/]) {
      expect(words).not.toMatch(banned);
    }
  });
});

describe("books Google Shopping turned down", () => {
  it("anything unexpected is 'nothing to show'", () => {
    expect(readShoppingProblems(null)).toEqual({ available: false, problems: [] });
    expect(readShoppingProblems({ available: false, problems: [{ issues: [] }] })).toEqual({ available: false, problems: [] });
  });
  it("keeps each book with its reasons and drops malformed rows", () => {
    const read = readShoppingProblems({ available: true, problems: [null, { offerId: "b1", title: "Moth Book", issues: [{ severity: "DISAPPROVED", description: "Missing price", resolution: "Add a price" }] }, { title: "x" }] });
    expect(read.available).toBe(true);
    expect(read.problems).toEqual([{ offerId: "b1", title: "Moth Book", issues: [{ severity: "DISAPPROVED", description: "Missing price", resolution: "Add a price" }] }]);
  });
});

describe("the stock list in Google Sheets", () => {
  it("only a Google Sheets address is ever offered as a link", () => {
    expect(readStockSheet(null)).toEqual({ available: false });
    expect(readStockSheet({ available: true, url: "https://docs.google.com/spreadsheets/d/abc/edit", rows: 3 })).toMatchObject({ available: true, url: "https://docs.google.com/spreadsheets/d/abc/edit", rows: 3 });
    expect(readStockSheet({ available: true, url: "https://example.com/phish" }).url).toBeUndefined();
    expect(readStockSheet({ available: true, url: "javascript:alert(1)" }).url).toBeUndefined();
  });
});

describe("tracking after Connect Google", () => {
  let consent: string | null = null;
  beforeEach(() => {
    __resetGa4ForTests();
    consent = null;
    const appended: unknown[] = [];
    (globalThis as any).window = {
      location: { pathname: "/books/salt", href: "https://moth-press.web.app/books/salt" },
      addEventListener: vi.fn(),
      localStorage: { getItem: (k: string) => (k === CONSENT_KEY ? consent : null) },
      sessionStorage: { getItem: () => null, setItem: () => {} },
    };
    (globalThis as any).document = { head: { appendChild: (n: unknown) => appended.push(n) }, createElement: () => ({}), title: "Salt", referrer: "" };
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const pageViews = () => ((globalThis as any).window.dataLayer || []).filter((a: any) => a[0] === "event" && a[1] === "page_view");
  // What the platform's connect job writes into the shop's public settings (LMB-PLATFORM google/connect.js).
  const connected = { analytics: { ga4MeasurementId: "G-MOTH1234" } };

  it("sends nothing before Google is connected", async () => {
    configureGa4(({} as any).analytics?.ga4MeasurementId);
    ga4PageView();
    await flush();
    expect((globalThis as any).window.dataLayer).toBeUndefined();
  });

  it("starts counting once the measurement ID is in the shop's settings", async () => {
    configureGa4(connected.analytics.ga4MeasurementId);
    ga4PageView();
    await flush();
    expect(pageViews()).toHaveLength(1);
    expect(pageViews()[0][2]).toMatchObject({ send_to: "G-MOTH1234" });
  });

  it("never counts a visitor who declined analytics", async () => {
    consent = JSON.stringify({ analytics: false });
    configureGa4(connected.analytics.ga4MeasurementId);
    ga4PageView();
    await flush();
    expect((globalThis as any).window.dataLayer).toBeUndefined();
  });
});
