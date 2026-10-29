// Admin: Connect Google (code plan 6.17), for the Overview and Settings › General › Visitors & Google. The platform's
// Google link (LMB-PLATFORM google/, PLATFORM_GOOGLE_URL) does the work: one sign-in with the press's Google account,
// then Analytics, Search Console, Google Shopping and the shop's email sender are linked for the shop, and the
// measurement ID and property number are written into this shop's own settings, where googleAnalytics.js and
// searchConsole.js read them as before. The shop proves who it is with its service key, like the payment, email and
// domain services. Admin-only. A shop without the link answers "not_available", and the admin keeps its older cards.
//
//   body { action: "googleConnect", step: "status" | "connectLink" | "tryAgain" | "disconnect" | "productProblems" | "sheetSync", returnUrl?, extras?, part? }

const STEPS = Object.freeze({ status: "google.status", connectLink: "google.connectLink", tryAgain: "google.tryAgain", disconnect: "google.disconnect", productProblems: "google.productProblems", sheetSync: "google.sheetSync" });
const EXTRAS = Object.freeze(["drive", "youtube", "calendar", "businessProfile", "ads"]);

function argsFor(step, body) {
  if (step === "connectLink") {
    const returnUrl = typeof body.returnUrl === "string" && /^https:\/\/[^\s"'<>]+$/.test(body.returnUrl) ? body.returnUrl.slice(0, 500) : null;
    if (!returnUrl) return null;
    const extras = Array.isArray(body.extras) ? EXTRAS.filter((e) => body.extras.includes(e)) : [];
    return { returnUrl, extras };
  }
  if (step === "tryAgain") return typeof body.part === "string" && /^[a-zA-Z]{2,30}$/.test(body.part) ? { step: body.part } : null;
  return {};
}

const HEADINGS = ["Title", "Author", "Code (ISBN)", "Price", "On hand", "Stockroom last updated"];
const cell = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");

/** The stock list for the press's Google Sheet: a heading line and one line per stockroom product (plan 16.1). */
function stockSheetRows(books) {
  const lines = (Array.isArray(books) ? books : []).slice(0, 2000).map((b) => [
    cell(b?.title), cell(b?.author), cell(b?.isbn, 40),
    typeof b?.price === "number" && b.price > 0 ? b.price : "",
    typeof b?.onHand === "number" && Number.isFinite(b.onHand) ? b.onHand : "",
    cell(b?.feedAt, 40),
  ]);
  return [HEADINGS, ...lines];
}

function googleConnectActions({ url, shopId, serviceKey, requireAdmin, readStock = async () => [], fetch = globalThis.fetch, timeoutMs = 60000 }) {
  async function handleGoogleConnect(req, res) {
    if (!await requireAdmin(req, res)) return;
    if (!url) {
      res.status(409).json({ error: "Connect Google isn't available for this shop.", code: "not_available" });
      return;
    }
    const step = req.body?.step;
    let args = Object.hasOwn(STEPS, step) ? argsFor(step, req.body) : null;
    if (step === "sheetSync") {
      try { args = { rows: stockSheetRows(await readStock()) }; } catch (err) {
        console.error("Stock list for the Google Sheet couldn't be read:", err?.message || err);
        res.status(409).json({ error: "Your stockroom isn't set up in this shop yet, so there is no stock list to send.", code: "no_stockroom" });
        return;
      }
    }
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
        headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op: STEPS[step], args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error("Google link unreachable:", err?.message || err);
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
  return { handleGoogleConnect };
}

module.exports = { googleConnectActions, stockSheetRows, STEPS, EXTRAS };
