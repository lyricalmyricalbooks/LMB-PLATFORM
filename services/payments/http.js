// The payment service's two web doors, hosted later as one function in the platform project. Like the email service's
// door (services/email/http.js), the handler takes a plain request and returns { status, body }, so tests need no
// server.
//
//   POST /shop            a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body
//                         `{ op, mode, args }` (service.js lists the calls)
//   POST /stripe/events   the one Stripe Connect events address; needs the raw body for Stripe's signature
//
// `request` is `{ method, path, headers, body, rawBody }`: `body` the parsed JSON (shop calls), `rawBody` the exact
// text Stripe signed (events).

const reply = (status, body) => ({ status, body });

export async function handlePayments(request, { service }) {
  if (request?.method !== "POST") return reply(405, { error: "Send a POST." });
  const path = String(request.path ?? "").replace(/\/+$/, "");
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  if (path === "/stripe/events") {
    const raw = typeof request.rawBody === "string" ? request.rawBody : Buffer.isBuffer(request.rawBody) ? request.rawBody.toString("utf8") : null;
    if (raw === null) return reply(400, { error: "The event's raw body is missing." });
    return service.stripeEvent(request.headers, raw);
  }
  return reply(404, { error: "No such door." });
}
