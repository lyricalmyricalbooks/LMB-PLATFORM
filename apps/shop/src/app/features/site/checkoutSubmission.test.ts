import { describe, expect, it } from "vitest";
import * as lifecycle from "./stripeLifecycle";

describe("checkout submission guard", () => {
  it("admits only one attempt while asynchronous validation is pending", async () => {
    const submit = lifecycle.createCheckoutSubmission();
    let release: () => void;
    let attempts = 0;
    const first = submit(async () => { attempts++; await new Promise<void>(resolve => { release = resolve; }); return false; });
    await submit(async () => { attempts++; return false; });
    expect(attempts).toBe(1);
    release!(); await first;
    await submit(async () => { attempts++; return false; });
    expect(attempts).toBe(2);
  });
  it("keeps checkout locked after handing the shopper to a provider", async () => {
    const submit = lifecycle.createCheckoutSubmission();
    let attempts = 0;
    await submit(async () => { attempts++; return true; });
    await submit(async () => { attempts++; return false; });
    expect(attempts).toBe(1);
  });
  it("releases the lock after an error so a corrected attempt can proceed", async () => {
    const submit = lifecycle.createCheckoutSubmission();
    await expect(submit(async () => { throw new Error("provider failed"); })).rejects.toThrow("provider failed");
    let retried = false;
    await submit(async () => { retried = true; return false; });
    expect(retried).toBe(true);
  });
});
