// The domain service's web door, hosted later as one function in the platform project. Like the payment and email
// doors, it takes a plain request and returns { status, body }, so tests need no server.
//
//   POST /shop   a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body `{ op, args }`
//                (domains.js lists the calls)

export async function handleDomains(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  if (request?.method !== "POST") return { status: 405, body: { error: "Send a POST." } };
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  return { status: 404, body: { error: "No such door." } };
}
