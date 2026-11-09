// Chit Chats, the Canadian discount courier (https://chitchats.com/docs/api/v1, read 4 November 2026). Only the calls that
// page documents are used here; nothing is guessed:
//
//   POST /api/v1/clients/<clientId>/shipments            create a shipment (no postage is bought: postage_type "unknown")
//   GET  /api/v1/clients/<clientId>/shipments/<id>       one shipment: status, carrier, carrier_tracking_code, tracking_url
//   GET  /api/v1/clients/<clientId>/shipments?limit=1    used to check a client id and access token work
//
// The access token goes in the Authorization header as it is (no "Bearer"). 2,000 calls per 5 minutes; a 429 says how
// long to wait in Retry-After. The sandbox is https://staging.chitchats.com. Creating a shipment costs nothing: the press
// picks and pays for postage on Chit Chats' own site, as with its other shop connections.
export const CHITCHATS_BASE = "https://chitchats.com";
export const CHITCHATS_SANDBOX = "https://staging.chitchats.com";
const CLIENT_ID = /^[0-9]{1,12}$/;

export class ChitChatsError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** The words a press reads when Chit Chats says no. */
function problemOf(status, body) {
  if (status === 401 || status === 403) return "Chit Chats didn't accept that client ID and access token. Copy them again from Chit Chats › Settings › Developer.";
  if (status === 404) return "Chit Chats couldn't find that. Check the client ID.";
  if (status === 429) return "Chit Chats asked us to slow down. We'll try again shortly.";
  const said = typeof body?.error?.message === "string" ? body.error.message : typeof body?.message === "string" ? body.message : "";
  if (status === 400 || status === 422) return said ? `Chit Chats said: ${said.slice(0, 300)}` : "Chit Chats couldn't take this shipment.";
  return "Chit Chats isn't answering right now. We'll try again shortly.";
}

/** A Chit Chats connection for one press's account. */
export function createChitChatsClient({ clientId, accessToken, fetch = globalThis.fetch, base = CHITCHATS_BASE, timeoutMs = 15000 }) {
  if (!CLIENT_ID.test(String(clientId ?? ""))) throw new ChitChatsError(400, "The client ID is the number Chit Chats shows next to your access tokens.");
  if (typeof accessToken !== "string" || accessToken.trim().length < 8) throw new ChitChatsError(400, "Paste the access token from Chit Chats › Settings › Developer.");
  const root = `${base}/api/v1/clients/${clientId}`;

  async function call(method, path, body) {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: { Authorization: accessToken.trim(), Accept: "application/json", ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    }).catch(() => null);
    if (!response) throw new ChitChatsError(503, "Chit Chats isn't answering right now. We'll try again shortly.");
    const text = await response.text().catch(() => "");
    let answer = null;
    try { answer = text ? JSON.parse(text) : null; } catch { answer = null; }
    if (!response.ok) {
      const wait = Number.parseInt(response.headers?.get?.("retry-after") ?? "", 10);
      throw new ChitChatsError(response.status, problemOf(response.status, answer), Number.isFinite(wait) ? wait : undefined);
    }
    return answer;
  }

  return {
    /** Throws a ChitChatsError when the client id or token doesn't work. */
    async check() {
      await call("GET", "/shipments?limit=1");
      return true;
    },
    /** Creates a shipment and answers its id (Chit Chats answers 201 with the new shipment). */
    async createShipment(shipment) {
      const answer = await call("POST", "/shipments", shipment);
      const id = answer?.shipment?.id ?? answer?.id;
      if (!id) throw new ChitChatsError(502, "Chit Chats made the shipment but didn't say its number. Look for it on Chit Chats.");
      return { id: String(id) };
    },
    async getShipment(id) {
      const answer = await call("GET", `/shipments/${encodeURIComponent(id)}`);
      return answer?.shipment ?? answer ?? null;
    },
  };
}
