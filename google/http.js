// The Google link's web door, hosted later as one function in the platform project. Like the other doors, it takes a
// plain request and returns { status, headers?, body }, so tests need no server.
//
//   POST /shop          a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON `{ op, args }`
//   GET  /google/oauth  Google sends the press back here after the Allow page

export async function handleGoogle(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  if (path === "/shop") {
    if (request.method !== "POST") return { status: 405, body: { error: "Send a POST." } };
    return service.shopCall({ headers: request.headers, body: request.body });
  }
  if (path === "/google/oauth") {
    if (request.method !== "GET") return { status: 405, body: { error: "Send a GET." } };
    return service.oauthCallback(request.query ?? {});
  }
  return { status: 404, body: { error: "No such door." } };
}
