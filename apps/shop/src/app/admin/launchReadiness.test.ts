import { describe, it, expect } from "vitest";
import { launchReadiness, readinessProgress, readinessSummary } from "./launchReadiness";

const goodSettings = {
  payments: { testMode: false, stripe: { connected: true, publicKey: "pk_live_" + "a".repeat(24), secretKeyStored: true } },
  policies: { shipping: "x", returns: "x", privacy: "x", terms: "x" },
  taxes: { rates: [{ country: "CA", rate: 13 }] },
  location: { street: "1 Main St", city: "Toronto", state: "ON", country: "Canada" },
};
const goodBook = { title: "A", status: "published", retailPrice: 20, photos: [{ url: "u" }], description: "d" };
const status = (items: any[], id: string) => items.find(i => i.id === id)?.status;

describe("launchReadiness", () => {
  it("does not confuse configuration with production evidence", () => {
    const items = launchReadiness({ settings: goodSettings, books: [goodBook], shippingProfiles: [{}], emailLog: [{ status: "sent" }], orders: [{ paymentStatus: "paid" }] });
    expect(status(items, "email")).toBe("warn");
    expect(status(items, "first-sale")).toBe("warn");
    expect(status(items, "deployment")).toBe("warn");
    expect(readinessSummary(items)).not.toBe("ok");
  });

  it("flags the launch blockers", () => {
    const items = launchReadiness({ settings: { payments: {} }, books: [], shippingProfiles: [], emailLog: [{ status: "failed", error: "bad key" }], orders: [{ paymentStatus: "paid", isTest: true }] });
    expect(status(items, "payments")).toBe("block");
    expect(status(items, "books")).toBe("block");
    expect(status(items, "email")).toBe("block");
    expect(status(items, "shipping")).toBe("block");
    expect(status(items, "policies")).toBe("warn");
    expect(status(items, "first-sale")).toBe("warn");
    expect(status(items, "tax")).toBe("warn");
    expect(readinessSummary(items)).toBe("block");
  });

  it("treats switched-off tax collection as a decision, not a gap", () => {
    const settings = { ...goodSettings, taxes: { rates: [{ country: "Canada", region: "Ontario", rate: 13 }], collect: false } };
    const items = launchReadiness({ settings, books: [goodBook], shippingProfiles: [{}], emailLog: [], orders: [] });
    expect(status(items, "tax")).toBe("ok");
    expect(items.find(i => i.id === "taxGaps")).toBeUndefined();
  });

  it("names incomplete books and ignores drafts", () => {
    const items = launchReadiness({ settings: goodSettings, books: [goodBook, { title: "No price", retailPrice: 0, photos: [{}], description: "d" }, { title: "Draft", status: "draft" }], shippingProfiles: [{}], emailLog: [{ status: "sent" }], orders: [] });
    const books = items.find(i => i.id === "books")!;
    expect(books.status).toBe("warn");
    expect(books.detail).toBe("No price");
  });

  it("warns in sandbox mode; a missing test secret key blocks (no fallback in test mode)", () => {
    const items = launchReadiness({ settings: { ...goodSettings, payments: { testMode: true, stripe: { connected: true, testPublicKey: "pk_test_" + "a".repeat(24) } } }, books: [goodBook], shippingProfiles: [{}], emailLog: [{ status: "sent" }], orders: [] });
    expect(status(items, "payments")).toBe("warn");
    expect(status(items, "stripe-secret")).toBe("block");
  });
  it("only warns when live mode has no secret key here (the Functions secret may cover it)", () => {
    const items = launchReadiness({ settings: { ...goodSettings, payments: { stripe: { connected: true, publicKey: "pk_live_" + "a".repeat(24) } } }, books: [goodBook], shippingProfiles: [{}], emailLog: [{ status: "sent" }], orders: [] });
    expect(status(items, "stripe-secret")).toBe("warn");
  });
});

describe("readinessProgress", () => {
  it("counts green checks and lists the open ones, blocking first", () => {
    const items = launchReadiness({ settings: { ...goodSettings, policies: {} }, books: [goodBook], shippingProfiles: [], emailLog: [{ status: "failed", error: "x" }], orders: [] });
    const p = readinessProgress(items);
    expect(p.total).toBe(items.length);
    expect(p.done + p.open.length).toBe(p.total);
    expect(p.completed.every(i => i.status === "ok")).toBe(true);
    expect(p.open[0].status).toBe("block");
    expect(p.open.map(i => i.id)).toEqual(expect.arrayContaining(["shipping", "policies", "email", "first-sale"]));
  });
  it("is complete when everything is green", () => {
    const items = launchReadiness({ settings: goodSettings, books: [goodBook], shippingProfiles: [{}], emailLog: [{ status: "sent" }], orders: [{ paymentStatus: "paid" }] });
    expect(readinessProgress(items).open.map(i => i.id)).toContain("deployment");
  });
});

describe("launch readiness: test-only email sender", () => {
  it("does not call Resend's onboarding sender 'working'", () => {
    const items = launchReadiness({ settings: {}, books: [], shippingProfiles: [], orders: [], emailLog: [{ status: "sent", from: "onboarding@resend.dev" }] });
    const email = items.find(i => i.id === "email")!;
    expect(email.status).toBe("block");
    expect(email.label).toMatch(/only reach you/);
  });
  it("reads past a Gmail→backup 'fallback' row to the real outcome", () => {
    const fallback = { status: "fallback", error: "Gmail SMTP rejected the send" };
    const sandbox = launchReadiness({ settings: {}, books: [], shippingProfiles: [], orders: [], emailLog: [fallback, { status: "sent", from: "onboarding@resend.dev" }] });
    expect(sandbox.find(i => i.id === "email")!.label).toMatch(/only reach you/);
    const ok = launchReadiness({ settings: {}, books: [], shippingProfiles: [], orders: [], emailLog: [fallback, { status: "sent", from: "shop@example.com" }] });
    expect(ok.find(i => i.id === "email")!.status).not.toBe("block");
  });
});

import { uncoveredTaxRegions } from "../features/site/taxRate";
describe("uncoveredTaxRegions", () => {
  it("lists provinces with no rate when only some are set", () => {
    const gaps = uncoveredTaxRegions([{ country: "Canada", region: "ON", rate: 13 } as any]);
    expect(gaps[0].country).toBe("Canada");
    expect(gaps[0].regions).toContain("Alberta");
    expect(gaps[0].regions).not.toContain("Ontario");
  });
  it("treats a country-wide rate as covering every province", () => {
    expect(uncoveredTaxRegions([{ country: "CA", region: "", rate: 5 } as any])).toEqual([]);
  });
});

describe("readiness evidence boundaries", () => {
  const input = { settings: goodSettings, books: [goodBook], shippingProfiles: [{ id: "p", zones: [] }], emailLog: [{ status: "sent", from: "shop@example.com" }], orders: [{ paymentStatus: "paid" }] };
  it("blocks a profile without zones and explains provider acceptance", () => {
    const rows = launchReadiness(input);
    expect(status(rows, "shipping")).toBe("block");
    expect(rows.find(i => i.id === "email")?.detail).toMatch(/accept|inbox/i);
    expect(rows.find(i => i.id === "first-sale")?.detail).not.toMatch(/all worked/);
  });
  it("reviews contributor, edition and likely test titles without editing catalog data", () => {
    const book = { ...goodBook, title: "Test book" };
    const original = JSON.stringify(book);
    const rows = launchReadiness({ ...input, books: [book] });
    expect(status(rows, "catalog-metadata")).toBe("warn");
    expect(status(rows, "catalog-test-content")).toBe("warn");
    expect(JSON.stringify(book)).toBe(original);
  });
  it("treats an email waiting to retry as not sent, and ignores ones the owner stopped", () => {
    const base = { settings: goodSettings, books: [goodBook], shippingProfiles: [{}], orders: [] };
    expect(status(launchReadiness({ ...base, emailLog: [{ status: "queued", error: "Gmail refused" }] }), "email")).toBe("block");
    expect(status(launchReadiness({ ...base, emailLog: [{ status: "cancelled" }, { status: "failed" }] }), "email")).toBe("block");
    expect(status(launchReadiness({ ...base, emailLog: [{ status: "cancelled" }, { status: "sent" }] }), "email")).toBe("warn");
  });
});

describe("launchReadiness postal address", () => {
  it("blocks while no postal address is saved, and passes once one is", () => {
    const base = { books: [], shippingProfiles: [], emailLog: [], orders: [] };
    expect(status(launchReadiness({ settings: {}, ...base }), "mailing-address")).toBe("block");
    expect(status(launchReadiness({ settings: { location: { street: "  " } }, ...base }), "mailing-address")).toBe("block");
    expect(status(launchReadiness({ settings: { location: { city: "Toronto" } }, ...base }), "mailing-address")).toBe("ok");
  });
});
