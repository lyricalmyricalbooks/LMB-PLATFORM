// The admin's offline copy (public/admin-sw.js), for the combined admin only (shop + stockroom plan;
// docs/combined-admin.md "Offline"): once the admin has opened on a device, it opens again with no signal, and the
// stockroom inside it (with its own offline copy) keeps the fair till working and catches up later. Its scope is the
// admin's own address, so the shop's pages never change. A shop-only press gets none, and one that drops the
// stockroom has the copy taken away the next time the admin opens.
export const ADMIN_SW = "admin-sw.js";

const slash = (base: string) => (base.endsWith("/") ? base : `${base}/`);
/** The worker's address and scope for this build (the site can be built under a sub-path). */
export const adminWorker = (base = "/") => ({ url: `${slash(base)}${ADMIN_SW}`, scope: `${slash(base)}admin` });

type Workers = Pick<ServiceWorkerContainer, "register" | "getRegistrations">;

/** Turn the offline copy on (`on`) or take it away; quiet when the browser has no service workers or says no. */
export async function keepAdminOffline(on: boolean, { base = import.meta.env.BASE_URL, workers = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined }: { base?: string; workers?: Workers } = {}): Promise<boolean> {
  if (!workers) return false;
  const { url, scope } = adminWorker(base);
  try {
    if (on) { await workers.register(url, { scope }); return true; }
    for (const r of await workers.getRegistrations()) {
      if (new URL(r.scope).pathname === scope && (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "").endsWith(`/${ADMIN_SW}`)) await r.unregister();
    }
  } catch { /* private window, or service workers turned off: the admin simply needs a connection */ }
  return false;
}
