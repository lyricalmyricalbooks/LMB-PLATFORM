import { describe, expect, it } from "vitest";
import { currentRows, emailLogBadge, emailLogDetail, needsAttention } from "./emailLogDisplay";

describe("Recent deliveries rows", () => {
  it("shows a Gmail→backup switch as a warning, not a failure or a plain success", () => {
    expect(emailLogBadge({ status: "fallback" })).toEqual({ tone: "warning", label: "Gmail missed · used backup" });
    expect(emailLogBadge({ status: "failed" }).tone).toBe("danger");
    expect(emailLogBadge({ status: "sent" })).toEqual({ tone: "success", label: "Sent" });
    expect(emailLogBadge({ status: "sent", note: "sandbox" }).label).toBe("Sent (sandbox)");
  });
  it("names the provider that accepted the email", () => {
    expect(emailLogDetail({ keySource: "gmail" })).toBe("Accepted by Gmail");
    expect(emailLogDetail({ keySource: "settings" })).toBe("Accepted by Resend");
    expect(emailLogDetail({ error: "Gmail SMTP rejected" })).toBe("Gmail SMTP rejected");
  });
});

describe("retry queue rows", () => {
  it("shows a queued email as a warning with its next try, and a retried send as sent", () => {
    expect(emailLogBadge({ status: "queued" })).toEqual({ tone: "warning", label: "Will retry" });
    expect(emailLogBadge({ status: "cancelled" }).label).toBe("Stopped");
    expect(emailLogBadge({ status: "sent", attempt: 3 })).toEqual({ tone: "success", label: "Sent on retry" });
    expect(emailLogDetail({ status: "sent", keySource: "gmail", attempt: 3 })).toBe("Accepted by Gmail (try 3)");
    expect(emailLogDetail({ status: "queued", error: "Down.", retryAt: "2026-10-09T12:00:00.000Z" })).toMatch(/^Down\. Next try /);
  });
  it("counts failures and waiting emails as needing attention", () => {
    expect(["failed", "queued", "sent", "fallback", "cancelled"].map(status => needsAttention({ status }))).toEqual([true, true, false, false, false]);
  });
});

describe("current rows", () => {
  it("keeps only the newest row of each retried email, so a later success clears it", () => {
    const rows = [{ id: "s", status: "sent", outboxId: "o1" }, { id: "q2", status: "queued", outboxId: "o1" }, { id: "q", status: "queued", outboxId: "o1" }, { id: "x", status: "failed" }];
    expect(currentRows(rows).map(r => r.id)).toEqual(["s", "x"]);
    expect(currentRows(rows).filter(needsAttention).map(r => r.id)).toEqual(["x"]);
  });
});
