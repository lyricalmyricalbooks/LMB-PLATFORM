// Admin: Settings › Bookkeeping (code plan 7.16), the QuickBooks link. The platform's bookkeeping service
// (LMB-PLATFORM services/accounting, PLATFORM_ACCOUNTING_URL) holds the Intuit keys and the press's tokens and does every
// QuickBooks write; this passes the admin's steps on, as this shop, with its service key. Admin-only.
//
//   body { action: "bookkeeping", step, ... }
//     status                                    is the link on, connected, set up; the last day sent
//     connect { returnUrl }                     Intuit's sign-in page (step 1)
//     options                                   the company's tax codes and accounts (step 3)
//     save { style, taxCodes, noTaxCode, accounts }  steps 2 and 3
//     resend { date }                           Send again for one day; needs the day's numbers (`buildDay`)
//     disconnect
//
// Without PLATFORM_ACCOUNTING_URL the link is off: `status` answers { enabled: false } (the page stays hidden) and every
// other step is refused.

const STEPS = Object.freeze({
  status: "accounting.status",
  connect: "accounting.connectLink",
  options: "accounting.options",
  save: "accounting.save",
  resend: "accounting.resend",
  disconnect: "accounting.disconnect",
});

// The shop charges in Canadian dollars (Settings › Payments › Currency).
const SHOP_CURRENCY = "CAD";
const { dailyBookkeeping } = require("./shared/bookkeeping");

/**
 * One day's numbers for Send again, built from the shop's orders with the same rules as the monthly bookkeeping file.
 * A day with no sales or refunds sends zeros, so QuickBooks matches the shop.
 * @param {object[]} orders every order (a refund can land on an older order)
 * @param {string} date YYYY-MM-DD in the shop's time zone
 */
function dayFromOrders(orders, date, timeZone = "America/Toronto") {
  const found = dailyBookkeeping(orders, { month: date.slice(0, 7), currency: SHOP_CURRENCY, timeZone }).find((d) => d.date === date);
  return found || {
    date, salesCents: 0, shippingCents: 0, discountsCents: 0, giftCardsSoldCents: 0, giftCardsUsedCents: 0,
    refundsCents: 0, taxes: {}, feesCents: 0, netCents: 0, currency: SHOP_CURRENCY,
  };
}

/**
 * @param {object} deps
 * @param {(date: string) => Promise<object|null>} [deps.buildDay] the day's numbers in the bookkeeping service's fixed
 *   shape (plan 7.12's daily summary); without it Send again says the numbers aren't ready
 */
function bookkeepingActions({ url, shopId, serviceKey, requireAdmin, buildDay = null, fetch = globalThis.fetch, timeoutMs = 30000 }) {
  function argsFor(step, body) {
    if (step === "connect") return { returnUrl: typeof body.returnUrl === "string" ? body.returnUrl.slice(0, 500) : "" };
    if (step === "save") {
      const { style, taxCodes, noTaxCode, accounts } = body;
      return { style, taxCodes, noTaxCode, accounts, currency: SHOP_CURRENCY };
    }
    return {};
  }

  async function handleBookkeeping(req, res) {
    if (!await requireAdmin(req, res)) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const step = body.step;
    if (!Object.hasOwn(STEPS, step)) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    if (!url) {
      if (step === "status") res.json({ enabled: false });
      else res.status(409).json({ error: "Bookkeeping links aren't available for this shop.", code: "not_available" });
      return;
    }
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!key) {
      res.status(503).json({ error: "This shop isn't connected to the platform yet.", code: "not_connected" });
      return;
    }
    let args = argsFor(step, body);
    if (step === "resend") {
      const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : "";
      if (!date) {
        res.status(400).json({ error: "Choose a day.", code: "bad_request" });
        return;
      }
      const summary = buildDay ? await buildDay(date) : null;
      if (!summary) {
        res.status(409).json({ error: "That day's numbers can't be read yet. Try again tomorrow.", code: "not_ready" });
        return;
      }
      args = { summary };
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
      console.error("Bookkeeping service unreachable:", err?.message || err);
      res.status(502).json({ error: "The platform didn't answer. Try again in a minute.", code: "unreachable" });
      return;
    }
    let answer = null;
    try { answer = await response.json(); } catch { answer = null; }
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      res.status(status).json({ error: answer?.error?.message || "The platform couldn't do that just now.", code: answer?.error?.code || "platform_error" });
      return;
    }
    res.json(answer ?? {});
  }
  return { handleBookkeeping };
}

module.exports = { bookkeepingActions, dayFromOrders, STEPS, SHOP_CURRENCY };
