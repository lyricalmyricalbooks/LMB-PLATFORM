// When this shop's admin was last updated by the platform: the release builder (LMB-PLATFORM
// services/release-runner/builder.js) stamps every build with its version and time. A build made any other way (a
// local `vite build`, the setup-mode build) has no stamp and shows nothing.

export type LastUpdated = { at: Date; version: string };

export function lastUpdated(env: Record<string, unknown> = import.meta.env): LastUpdated | null {
  const at = new Date(String(env.VITE_SHOP_BUILT_AT ?? ""));
  const version = String(env.VITE_SHOP_RELEASE ?? "").trim();
  return version && !isNaN(at.getTime()) ? { at, version } : null;
}

/** "Last updated 10 Nov 2026, 11:52 p.m." in the reader's own date style. */
export function lastUpdatedLine(stamp: LastUpdated): string {
  const when = stamp.at.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  return `Last updated ${when}`;
}
