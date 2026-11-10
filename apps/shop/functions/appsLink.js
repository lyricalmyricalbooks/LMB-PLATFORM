// Admin: Settings › Apps (platform plan 26.5), through the platform's app store door (LMB-PLATFORM
// services/apps/shopDoor.js, PLATFORM_APPS_URL): the apps installed on this shop, the store, and Remove. The shop proves
// who it is with its service key, like the Google and domain doors; only admins get here. A shop without the door answers
// "not_available" and the page shows only its app activity (appRequests, read straight from this shop).
//
//   body { action: "apps", step: "installed" | "store" | "remove", appId?, category? }

const STEPS = Object.freeze({ installed: "apps.installed", store: "apps.store", remove: "apps.remove" });
const ID = /^app_[a-f0-9]{12,32}$/;
const CATEGORY = /^[a-z-]{2,40}$/;

function argsFor(step, body, who) {
  if (step === "remove") return typeof body.appId === "string" && ID.test(body.appId) ? { appId: body.appId, by: who } : null;
  if (step === "store") return typeof body.category === "string" && CATEGORY.test(body.category) ? { category: body.category } : {};
  return {};
}

function appsLinkActions({ url, shopId, serviceKey, requireAdmin, fetch = globalThis.fetch, timeoutMs = 20000 }) {
  async function handleApps(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    if (!url) {
      res.status(409).json({ error: "The app store isn't available for this shop.", code: "not_available" });
      return;
    }
    const step = req.body?.step;
    const args = Object.hasOwn(STEPS, step) ? argsFor(step, req.body, String(admin.email || "")) : null;
    if (!args) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) {
      res.status(503).json({ error: "This shop isn't connected to the platform yet.", code: "not_connected" });
      return;
    }
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": typeof shopId === "function" ? shopId() : shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: STEPS[step], args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error("App store unreachable:", err?.message || err);
      res.status(502).json({ error: "The platform didn't answer. Try again in a minute.", code: "unreachable" });
      return;
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.ok === false) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      res.status(status).json({ error: body?.message || "The platform couldn't do that just now.", code: "platform_error" });
      return;
    }
    res.json(body ?? {});
  }
  return { handleApps };
}

module.exports = { appsLinkActions, STEPS };
