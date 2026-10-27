// Helpers for "ask the server again whenever the form changes" requests (checkout carrier rates).

/**
 * Hands out tickets; only the newest ticket is still current. A slow reply for an earlier address
 * must not overwrite the quotes for the latest one, nor clear the loading state while it is pending.
 */
export function createLatestGuard() {
  let latest = 0;
  return {
    next(): number { return ++latest; },
    isCurrent(ticket: number): boolean { return ticket === latest; },
    /** Makes every outstanding ticket stale (the form changed or the page is leaving). */
    invalidate(): void { latest++; },
  };
}

/** An abort signal that fires after `ms`, or when `parent` aborts. `done()` clears the timer. */
export function signalWithTimeout(ms: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onParent = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: controller.signal,
    abort() { controller.abort(); },
    done() { clearTimeout(timer); parent?.removeEventListener("abort", onParent); },
  };
}

/** How long checkout waits for live carrier rates before falling back to the shop's own rates. */
export const RATES_TIMEOUT_MS = 12_000;
