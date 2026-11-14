// Settings › Shipping › Live rates and labels on a Colophon shop: Connect Shippo (the press's own Shippo account,
// LMB-PLATFORM services/shippo/link.js). Colophon's Shippo sign-in codes stay with the platform; the shop asks through
// the app store door (PLATFORM_APPS_URL) with its service key, like Settings › Apps.
//
//   body { action: "shippoLink", step: "status" }                       { available, connected }
//   body { action: "shippoLink", step: "connect", returnUrl }           { url }  Shippo's "allow Colophon" page
//   body { action: "shippoLink", step: "finish", ticket }               { connected: true }
//   body { action: "shippoLink", step: "disconnect" }                   { connected: false }
//
// `finish` swaps the one-use ticket Shippo's return brought for the account's token, checks it with Shippo, and keeps it
// in the shop's admin-only Shippo record (the same `apiToken` an own-account shop's saved key uses), marked
// `authType: "oauth"`. From then on live rates, address checks, labels and tracking use it (getShippoToken, callShippo).
// Connecting and disconnecting are the owner's; staff may look.

const TICKET = /^[0-9a-f]{48}$/;

function shippoLinkActions({ url, shopId, serviceKey, requireAdmin, requireOwner = requireAdmin, configDoc, callShippo, fetch = globalThis.fetch, now = () => new Date(), timeoutMs = 20000 }) {
  async function platform(op, args = {}) {
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) throw Object.assign(new Error("This shop isn't connected to the platform yet."), { status: 503, code: "not_connected" });
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": typeof shopId === "function" ? shopId() : shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw Object.assign(new Error("The platform didn't answer. Try again in a minute."), { status: 502, code: "unreachable" });
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.ok === false) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      throw Object.assign(new Error(body?.message || body?.error?.message || "The platform couldn't do that just now."), { status, code: "platform_error" });
    }
    return body ?? {};
  }

  const connectedNow = async () => {
    const snap = await configDoc().get();
    const data = snap.exists ? snap.data() : {};
    return typeof data?.apiToken === "string" && data.apiToken.trim().length > 0;
  };

  const STEPS = {
    async status() {
      const connected = await connectedNow();
      if (!url) return { available: false, connected };
      const { available } = await platform("shippo.status");
      return { available: available === true, connected };
    },
    async connect(body) {
      if (typeof body.returnUrl !== "string" || body.returnUrl.length > 500) throw Object.assign(new Error("returnUrl is missing."), { status: 400, code: "bad_request" });
      const { url: authorize } = await platform("shippo.connectLink", { returnUrl: body.returnUrl });
      if (typeof authorize !== "string" || !authorize.startsWith("https://goshippo.com/")) throw Object.assign(new Error("The platform couldn't open Shippo's sign-in."), { status: 502, code: "platform_error" });
      return { url: authorize };
    },
    async finish(body, who) {
      if (typeof body.ticket !== "string" || !TICKET.test(body.ticket)) throw Object.assign(new Error("That Shippo sign-in has run out. Press Connect Shippo again."), { status: 400, code: "bad_request" });
      const { accessToken } = await platform("shippo.claim", { ticket: body.ticket });
      const token = typeof accessToken === "string" ? accessToken.trim() : "";
      if (token.length < 10 || token.length > 500 || /\s/.test(token)) throw Object.assign(new Error("Shippo didn't finish the connection. Press Connect Shippo again."), { status: 502, code: "platform_error" });
      // Ask Shippo before saving, as a pasted key is: a connection that doesn't answer never replaces one that does.
      try {
        await callShippo("carrier_accounts/?results=1", "GET", null, token, 8000);
      } catch {
        throw Object.assign(new Error("Shippo didn't accept the connection. Press Connect Shippo again."), { status: 502, code: "refused" });
      }
      const at = now().toISOString();
      await configDoc().set({ apiToken: token, authType: "oauth", mode: "live", lastFour: null, verifiedAt: at, updatedAt: at, updatedBy: who, disconnectedAt: null }, { merge: true });
      return { connected: true };
    },
    async disconnect(_body, who) {
      const at = new Date(now()).toISOString();
      // Live rates switch off with it, so checkout never waits on an account that's gone; the countries stay for later.
      await configDoc().set({ apiToken: "", authType: null, lastFour: null, mode: null, verifiedAt: null, dynamicRatesEnabled: false, updatedAt: at, updatedBy: who, disconnectedAt: at }, { merge: true });
      return { connected: false };
    },
  };

  async function handleShippoLink(req, res) {
    const step = req.body?.step;
    if (!Object.hasOwn(STEPS, step)) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    const person = await (step === "status" ? requireAdmin : requireOwner)(req, res);
    if (!person) return;
    if (step !== "status" && step !== "disconnect" && !url) {
      res.status(409).json({ error: "Connect Shippo opens soon.", code: "not_available" });
      return;
    }
    try {
      res.json(await STEPS[step](req.body ?? {}, String(person.email || "")));
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (status >= 500) console.error("Connect Shippo failed:", err?.message || err);
      res.status(status).json({ error: status === 500 ? "Something went wrong. Try again in a minute." : err.message, code: err?.code || "error" });
    }
  }

  return { handleShippoLink };
}

/** How a call to Shippo names the account: a connected account's token is a bearer token, a pasted key isn't. */
function shippoAuthHeaders(token) {
  const value = String(token || "");
  return /^oauth\./.test(value)
    ? { Authorization: `Bearer ${value}`, "Shippo-API-Version": "2018-02-08" }
    : { Authorization: `ShippoToken ${value}` };
}

module.exports = { shippoLinkActions, shippoAuthHeaders };
