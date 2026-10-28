// The payment service's two web doors, hosted later as one function in the platform project. Like the email service's
// door (services/email/http.js), the handler takes a plain request and returns { status, body }, so tests need no
// server.
//
//   POST /shop            a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body
//                         `{ op, mode, args }` (service.js lists the calls)
//   POST /stripe/events   the one Stripe Connect events address; needs the raw body for Stripe's signature
//   GET  /square/oauth    Square sends a press back here after Connect Square (`code`, `state` or `error`)
//   POST /square/events/live, /square/events/test   Square's events, one subscription per Square environment
//
// `request` is `{ method, path, query, headers, body, rawBody }`: `body` the parsed JSON (shop calls), `rawBody` the exact
// text Stripe or Square signed (events), `query` the address's parameters (Square's sign-in answer). An answer may
// carry `headers` (the sign-in answer is a redirect).

const reply = (status, body) => ({ status, body });

const rawText = (request) => (typeof request.rawBody === "string" ? request.rawBody : Buffer.isBuffer(request.rawBody) ? request.rawBody.toString("utf8") : null);

export async function handlePayments(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  if (path === "/square/oauth") {
    if (request.method !== "GET") return reply(405, { error: "Send a GET." });
    return service.squareOAuth(request.query ?? {});
  }
  if (request?.method !== "POST") return reply(405, { error: "Send a POST." });
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  const squareEvents = path.match(/^\/square\/events\/(live|test)$/);
  if (path === "/stripe/events" || squareEvents) {
    const raw = rawText(request);
    if (raw === null) return reply(400, { error: "The event's raw body is missing." });
    return squareEvents ? service.squareEvent(squareEvents[1], request.headers, raw) : service.stripeEvent(request.headers, raw);
  }
  return reply(404, { error: "No such door." });
}
