// Tells the shop when a shopper's browser hits an error: a page or section that failed to draw, or an uncaught script
// error. The server counts each distinct error (validateDiscountCode `action: "clientError"`, functions/clientErrors.js)
// and the admin sees them in Settings › General › Tools & records › Shop errors. Only the message, stack, page path and
// build go out; the server strips anything personal again. Never from the Studio preview, the admin, robots or dev.
import { functionFetch } from "./functionsBase";
import { looksAutomated } from "./ownerDevice";

export type ErrorKind = "page" | "section" | "script" | "promise";
export type ErrorReport = { kind: ErrorKind; message: string; stack: string; path: string; section: string; build: string };

// At most this many reports per page load, and each distinct error once.
const PAGE_LIMIT = 5;
const sent = new Set<string>();

// Noise every shop sees from browsers and extensions; none of it is the shop's own code failing.
const IGNORED = [/^Script error\.?$/i, /ResizeObserver loop/i, /^Load failed$/i, /^Failed to fetch$/i, /NetworkError/i,
  /AbortError/i, /The operation was aborted/i, /Non-Error promise rejection captured/i];

export function shouldIgnore(message: string): boolean {
  return !message.trim() || IGNORED.some(re => re.test(message.trim()));
}

/** Whether a rejected value is an Error raised in the shop's own bundle (a frame under <origin>/assets/). */
export function fromShopCode(reason: unknown, origin: string): boolean {
  const stack = reason instanceof Error ? String(reason.stack || "") : "";
  return stack.includes(`${origin}/assets/`);
}

/** The report a caught error becomes (pure; the path never carries the query or fragment). */
export function buildReport(kind: ErrorKind, error: unknown, where: { path: string; section?: string; build?: string }): ErrorReport {
  const err = error as { message?: unknown; stack?: unknown } | null;
  const message = String((err && typeof err === "object" ? err.message : error) ?? "").slice(0, 300);
  return {
    kind,
    message,
    stack: String((err && typeof err === "object" && err.stack) || "").slice(0, 2000),
    path: where.path.split(/[?#]/)[0] || "/",
    section: (where.section || "").slice(0, 60),
    build: (where.build || "").slice(0, 40),
  };
}

function reportingAllowed(): boolean {
  if (typeof window === "undefined" || !import.meta.env.PROD) return false;
  const { pathname, search } = window.location;
  if (/[?&]preview=true\b/.test(search) || window.parent !== window) return false;
  if (pathname.replace(import.meta.env.BASE_URL || "/", "/").startsWith("/admin")) return false;
  return !looksAutomated();
}

function buildId(): string {
  const script = typeof document !== "undefined" ? document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]') : null;
  return script?.src.match(/index-([\w-]+)\.js/)?.[1] || "";
}

/** Sends one report (fire and forget). Returns whether it was sent, for tests. */
export function reportClientError(kind: ErrorKind, error: unknown, section = ""): boolean {
  try {
    if (!reportingAllowed()) return false;
    const report = buildReport(kind, error, { path: window.location.pathname, section, build: buildId() });
    if (shouldIgnore(report.message)) return false;
    const key = `${kind}|${section}|${report.message}`;
    if (sent.has(key) || sent.size >= PAGE_LIMIT) return false;
    sent.add(key);
    functionFetch("validateDiscountCode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clientError", report }),
      keepalive: true,
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Uncaught errors and rejected promises from the shop's own scripts (main.tsx installs it once). */
export function installErrorReporting(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", event => {
    // Errors from other origins (extensions, embeds) carry no useful detail and aren't the shop's code.
    const file = event.filename || "";
    if (file && !file.startsWith(window.location.origin)) return;
    reportClientError("script", event.error || event.message);
  });
  // Other scripts' rejections (reCAPTCHA, Stripe, extensions) aren't the shop's code: only Errors thrown from its own bundle.
  window.addEventListener("unhandledrejection", event => {
    if (fromShopCode(event.reason, window.location.origin)) reportClientError("promise", event.reason);
  });
}
