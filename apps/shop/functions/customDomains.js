// Admin: the press's own web address (code plan 2.9), for Settings › General › Your web address. The platform's domain
// service (LMB-PLATFORM services/domains, PLATFORM_DOMAINS_URL) does the work: it saves the address, lets it call this
// shop's server code, asks Firebase Hosting to serve the shop there, and registers it for Apple Pay and Google Pay once
// live. The shop proves who it is with its service key, like the payment and email services. Admin-only. Plan 5.9 adds
// Make main (the address emails, links and Google use) and Remove; the service refuses removing the main address.
//
//   body { action: "customDomains", step: "list" | "add" | "connect" | "check" | "makeMain" | "remove", domain? }
// Plan 6.15: `connect` is the one step (add, then the Allow link or the guide for the press's domain seller).

const STEPS = Object.freeze({ list: "domains.list", add: "domains.add", connect: "domains.connect", check: "domains.check", makeMain: "domains.makeMain", remove: "domains.remove" });

function customDomainActions({ url, shopId, serviceKey, requireAdmin, fetch = globalThis.fetch, timeoutMs = 30000 }) {
  async function handleCustomDomains(req, res) {
    if (!await requireAdmin(req, res)) return;
    if (!url) {
      res.status(409).json({ error: "Your web address is set up by Colophon's team for this shop. Write to support to add one.", code: "not_available" });
      return;
    }
    const step = req.body?.step;
    if (!Object.hasOwn(STEPS, step)) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    const domain = typeof req.body?.domain === "string" ? req.body.domain.slice(0, 260) : undefined;
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) {
      res.status(503).json({ error: "This shop isn't connected to the platform yet.", code: "not_connected" });
      return;
    }
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: STEPS[step], args: domain === undefined ? {} : { domain } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error("Domain service unreachable:", err?.message || err);
      res.status(502).json({ error: "The platform didn't answer. Try again in a minute.", code: "unreachable" });
      return;
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      res.status(status).json({ error: body?.error?.message || "The platform couldn't do that just now.", code: body?.error?.code || "platform_error" });
      return;
    }
    res.json(body ?? {});
  }
  return { handleCustomDomains };
}

module.exports = { customDomainActions, STEPS };
