import { describe, expect, test, vi } from "vitest";
import { createLatestGuard, signalWithTimeout } from "./latestRequest";
import { createCheckoutSubmission, onPageRestored } from "./stripeLifecycle";

describe("#84 out-of-order carrier rates", () => {
  test("only the newest ticket is current", () => {
    const guard = createLatestGuard();
    const first = guard.next();
    const second = guard.next();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
    guard.invalidate();
    expect(guard.isCurrent(second)).toBe(false);
  });

  test("a hanging request is aborted after the timeout, or when its owner aborts", () => {
    vi.useFakeTimers();
    const slow = signalWithTimeout(1000);
    expect(slow.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(slow.signal.aborted).toBe(true);
    const parent = new AbortController();
    const child = signalWithTimeout(60_000, parent.signal);
    parent.abort();
    expect(child.signal.aborted).toBe(true);
    child.done();
    vi.useRealTimers();
  });
});

describe("#23 PayPal Back button", () => {
  test("a page restored from the back/forward cache unlocks Pay", async () => {
    const submit = createCheckoutSubmission();
    await submit(async () => true); // handed to PayPal: stays locked
    let ran = 0;
    await submit(async () => { ran++; return false; });
    expect(ran).toBe(0);

    const target = new EventTarget();
    const off = onPageRestored(target, () => submit.reset());
    // A normal load is not a restore.
    target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    await submit(async () => { ran++; return false; });
    expect(ran).toBe(0);
    target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await submit(async () => { ran++; return false; });
    expect(ran).toBe(1);
    off();
    await submit(async () => true);
    target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    await submit(async () => { ran++; return false; });
    expect(ran).toBe(1);
  });
});
