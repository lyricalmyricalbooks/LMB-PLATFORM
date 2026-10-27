import { describe, it, expect } from "vitest";
import { describeKeyReport, webhookState } from "./stripeChecks";

const good = (mode: "live" | "test") => ({ source: "stored" as const, publishableKeyMode: mode, keyMode: mode, ok: true, accountId: "acct_1" });

describe("describeKeyReport", () => {
  it("all green when the active mode's keys work and match", () => {
    const c = describeKeyReport({ activeMode: "test", live: good("live"), test: good("test"), sameAccount: true });
    expect(c.every((x) => x.tone === "success")).toBe(true);
    expect(c[0].text).toMatch(/^Test \(sandbox\) \(in use\)/);
  });
  it("a missing or rejected key in the active mode is danger", () => {
    expect(describeKeyReport({ activeMode: "live", live: { source: "none", publishableKeyMode: "live" }, test: good("test"), sameAccount: null })[0].tone).toBe("danger");
    expect(describeKeyReport({ activeMode: "live", live: { ...good("live"), ok: false, error: "Invalid API Key" }, test: good("test"), sameAccount: null })[0].text).toMatch(/Invalid API Key/);
  });
  it("catches a test key in the live slot and a wrong-mode publishable key", () => {
    const c = describeKeyReport({ activeMode: "live", live: { ...good("live"), keyMode: "test", publishableKeyMode: "test" }, test: good("test"), sameAccount: null });
    expect(c.filter((x) => x.tone === "danger").length).toBe(2);
  });
  it("warns when live and test keys are from different accounts", () => {
    expect(describeKeyReport({ activeMode: "live", live: good("live"), test: good("test"), sameAccount: false }).some((x) => /different Stripe accounts/.test(x.text))).toBe(true);
  });
});

describe("webhookState", () => {
  const base = { found: true, enabled: true, wrongUrl: false, missingEvents: [], savedSecret: true, deployedSecret: true, lastReceivedAt: "2026-10-07T10:00:00.000Z", lastFailureAt: null };
  it("healthy only after a delivery", () => {
    expect(webhookState(base).state).toBe("healthy");
    expect(webhookState({ ...base, lastReceivedAt: null }).state).toBe("waiting");
  });
  it("needs a fix when events are missing or no signing secret exists", () => {
    expect(webhookState({ ...base, missingEvents: ["payment_intent.succeeded"] }).state).toBe("needs-fix");
    expect(webhookState({ ...base, savedSecret: false, deployedSecret: false }).state).toBe("needs-fix");
  });
  it("signature failures count only when newer than the last good delivery", () => {
    expect(webhookState({ ...base, lastFailureAt: "2026-10-07T11:00:00.000Z" }).state).toBe("signature-failing");
    expect(webhookState({ ...base, lastFailureAt: "2026-10-07T09:00:00.000Z" }).state).toBe("healthy");
  });
  it("flags processing failures separately", () => {
    expect(webhookState({ ...base, lastProcessingFailureAt: "2026-10-07T11:00:00.000Z" }).processingFailing).toBe(true);
  });
});
