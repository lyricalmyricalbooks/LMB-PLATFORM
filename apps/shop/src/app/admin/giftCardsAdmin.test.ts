import { describe, expect, it } from "vitest";
import { dollarsToMinor, formatMinor, giftCardStatus, issuePayload, maskedCode, matchesGiftCard } from "./giftCardsAdmin";

const form = { amount: "25", recipientEmail: "", recipientName: "", message: "", expiresOn: "", note: "", sendEmail: false };

describe("gift card admin helpers", () => {
  it("names each status, test and disabled first", () => {
    const today = "2026-10-09";
    expect(giftCardStatus({ balanceMinor: 500 }, today).label).toBe("Active");
    expect(giftCardStatus({ balanceMinor: 0 }, today).label).toBe("Used up");
    expect(giftCardStatus({ balanceMinor: 500, enabled: false }, today).label).toBe("Disabled");
    expect(giftCardStatus({ balanceMinor: 500, expiresOn: "2026-10-08" }, today).label).toBe("Expired");
    expect(giftCardStatus({ balanceMinor: 500, expiresOn: "2026-10-09" }, today).label).toBe("Active");
    expect(giftCardStatus({ balanceMinor: 500, isTest: true, enabled: false }, today).label).toBe("Test");
  });
  it("formats cents and masks codes", () => {
    expect(formatMinor(1250)).toBe("CA$12.50");
    expect(maskedCode({ last4: "ABCD" })).toBe("••••ABCD");
    expect(dollarsToMinor("25.5")).toBe(2550);
    expect(dollarsToMinor("-10")).toBe(-1000);
    expect(dollarsToMinor("$7")).toBe(700);
    expect(Number.isNaN(dollarsToMinor("ten"))).toBe(true);
  });
  it("searches by last 4 and email", () => {
    const card = { last4: "WXYZ", recipientEmail: "sam@x.com" };
    expect(matchesGiftCard(card, "••••wxyz")).toBe(true);
    expect(matchesGiftCard(card, "SAM@")).toBe(true);
    expect(matchesGiftCard(card, "nope")).toBe(false);
  });
  it("builds the issue payload with the server's limits", () => {
    expect(issuePayload(form, "2026-10-09")).toEqual({ ok: true, payload: { amountMinor: 2500, sendEmail: false } });
    expect(issuePayload({ ...form, amount: "0.5" }, "2026-10-09").ok).toBe(false);
    expect(issuePayload({ ...form, amount: "10001" }, "2026-10-09").ok).toBe(false);
    expect(issuePayload({ ...form, sendEmail: true }, "2026-10-09")).toMatchObject({ ok: false, problems: [expect.stringMatching(/recipient's email/)] });
    expect(issuePayload({ ...form, expiresOn: "2026-10-01" }, "2026-10-09").ok).toBe(false);
    const ok = issuePayload({ ...form, recipientEmail: " Sam@X.com ", sendEmail: true, expiresOn: "2027-01-01", note: "Raffle prize" }, "2026-10-09");
    expect(ok).toEqual({ ok: true, payload: { amountMinor: 2500, recipientEmail: "sam@x.com", expiresOn: "2027-01-01", note: "Raffle prize", sendEmail: true } });
  });
});

describe("history amounts and code search", () => {
  it("shows a minus for removed money and for redemptions", async () => {
    const { historyAmount } = await import("./giftCardsAdmin");
    expect(historyAmount({ type: "adjusted", minor: -1000 })).toBe("−CA$10.00");
    expect(historyAmount({ type: "adjusted", minor: 500 })).toBe("+CA$5.00");
    expect(historyAmount({ type: "redeemed", minor: 250 })).toBe("−CA$2.50");
    expect(historyAmount({ type: "disabled", minor: 0 })).toBe("");
  });
  it("finds a card by its whole code, ignoring hyphens, spaces and case", () => {
    const card = { code: "ABCD-EFGH-JKMN-PQRS", last4: "PQRS" };
    expect(matchesGiftCard(card, "abcd efgh jkmn pqrs")).toBe(true);
    expect(matchesGiftCard(card, "ABCDEFGHJKMNPQRS")).toBe(true);
    expect(matchesGiftCard(card, "ABCDEFGHJKMNPQRT")).toBe(false);
  });
});

describe("gift card CSV", () => {
  it("masks codes unless asked and blocks spreadsheet formulas", async () => {
    const { giftCardsCsv } = await import("./giftCardsAdmin");
    const cards = [{ code: "ABCD-EFGH-JKMN-PQRS", last4: "PQRS", balanceMinor: 1250, initialMinor: 2500, recipientName: "=HYPERLINK(1)", source: "admin", createdAt: "2026-10-01T10:00:00Z" }];
    const masked = giftCardsCsv(cards, { today: "2026-10-09" });
    expect(masked).toContain('"••••PQRS","12.50","25.00","Active","\'=HYPERLINK(1)"');
    expect(masked).not.toContain("ABCD-EFGH");
    expect(giftCardsCsv(cards, { fullCodes: true, today: "2026-10-09" })).toContain('"ABCD-EFGH-JKMN-PQRS"');
  });
});
