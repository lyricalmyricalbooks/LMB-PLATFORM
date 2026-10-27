import { describe, expect, it } from "vitest";
import { paymentHealth } from "./paymentHealth";

describe("paymentHealth", () => {
  it("reports the launch blockers and operational warnings", () => {
    expect(paymentHealth({}).map(i => i.id)).toContain("no-gateway");
    const ids = paymentHealth({ testMode: true, stripe: { connected: true, publicSecretLeak: true }, manualMethods: [{ id: "wire", name: "Wire", enabled: true }] }).map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(["test-mode", "stripe-publishable", "client-secret", "stripe-test-secret", "manual:wire"]));
  });
  it("accepts a configured live provider", () => expect(paymentHealth({ stripe: { connected: true, publicKey: "pk_live_abcdefghijklmnopqrstuvwxyz", secretKeyStored: true } })).toEqual([]));
  it("a key being typed is not a public leak", () => {
    const ids = paymentHealth({ stripe: { connected: true, publicKey: "pk_live_abcdefghijklmnopqrstuvwxyz", secretKey: "sk_live_typing" } }).map(i => i.id);
    expect(ids).not.toContain("client-secret");
    expect(ids).not.toContain("stripe-live-secret");
  });
  it("warns when live mode has no stored secret key", () => {
    expect(paymentHealth({ stripe: { connected: true, publicKey: "pk_live_abcdefghijklmnopqrstuvwxyz" } }).map(i => i.id)).toEqual(["stripe-live-secret"]);
  });
});
