// After an update goes live, the old build's code files are gone from Hosting. A browser that opened the shop or the
// admin before the update then fails to fetch the next page's code ("Failed to fetch dynamically imported module").
// Instead of showing an error, the page reloads once to pick up the new build. A second failure within a minute is a
// real problem (offline, a broken deploy), so it is left to the error screens rather than reloading in a loop.

const KEY = "lmb-stale-build-reload";
const WINDOW_MS = 60_000;

const STALE_CHUNK = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /Failed to load module script/i,
];

/** Whether an error is a page's code file that could not be fetched (pure). */
export function isStaleChunkError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "");
  return STALE_CHUNK.some(re => re.test(message));
}

/** Reloads the page once per minute at most. Returns whether it reloaded. */
export function reloadForNewBuild(storage: Pick<Storage, "getItem" | "setItem"> | null = safeSession(),
  reload: () => void = () => window.location.reload(), now = Date.now()): boolean {
  try {
    const last = Number(storage?.getItem(KEY) || 0);
    if (last && now - last < WINDOW_MS) return false;
    storage?.setItem(KEY, String(now));
  } catch { /* storage blocked: still reload once, the browser's own cache stops a loop */ }
  reload();
  return true;
}

function safeSession(): Storage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}

/** Vite reports a failed page-code fetch as `vite:preloadError`; reload for the new build instead (main.tsx). */
export function installStaleBuildReload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", event => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
