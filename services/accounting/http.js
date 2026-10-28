// The bookkeeping service's web doors, hosted later as one function in the platform project. Like the payment and
// domain doors, the handler takes a plain request and returns { status, headers?, body }, so tests need no server.
//
//   POST /shop                  a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body
//                               `{ op, args }` (accounting.js lists the calls)
//   GET  /quickbooks/oauth      Intuit sends a press back here after signing in (`code`, `state`, `realmId` or `error`)
//   GET  /quickbooks/reconnect  the Intuit app's Reconnect URL: points the press to their shop's Bookkeeping page

export async function handleAccounting(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  if (path === "/quickbooks/oauth" || path === "/quickbooks/reconnect") {
    if (request.method !== "GET") return { status: 405, body: { error: "Send a GET." } };
    return path === "/quickbooks/oauth" ? service.oauthCallback(request.query ?? {}) : service.reconnectPage(request.query ?? {});
  }
  if (request?.method !== "POST") return { status: 405, body: { error: "Send a POST." } };
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  return { status: 404, body: { error: "No such door." } };
}
