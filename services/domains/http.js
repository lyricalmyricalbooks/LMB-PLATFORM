// The domain service's web door, hosted later as one function in the platform project. Like the payment and email
// doors, it takes a plain request and returns { status, headers?, body }, so tests need no server.
//
//   POST /shop     a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body `{ op, args }`
//                  (domains.js lists the calls)
//   GET  /allowed  the domain seller's Allow window sends the press back here (plan 6.15), then on to their shop

export async function handleDomains(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  if (path === "/allowed") {
    if (request.method !== "GET") return { status: 405, body: { error: "Send a GET." } };
    return service.allowedCall(request.query ?? {});
  }
  if (request?.method !== "POST") return { status: 405, body: { error: "Send a POST." } };
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  return { status: 404, body: { error: "No such door." } };
}
