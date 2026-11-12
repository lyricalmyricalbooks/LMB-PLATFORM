// The social service's web doors, hosted on the platform's server at /api/social (hosted.js). Like the bookkeeping doors,
// the handler takes a plain request and returns { status, headers?, body }, so tests need no server.
//
//   POST /shop                 a shop's call: `X-Shop-Id` + `Authorization: Bearer <shop service key>`, JSON body
//                              `{ op, args }` (social.js lists the calls)
//   GET  /<network>/oauth      Meta, Pinterest or TikTok sends a press back here after saying yes or no
import { NETWORKS } from "./endpoints.js";

export async function handleSocial(request, { service }) {
  const path = String(request?.path ?? "").replace(/\/+$/, "");
  const oauth = /^\/([a-z]+)\/oauth$/.exec(path);
  if (oauth && NETWORKS.includes(oauth[1])) {
    if (request.method !== "GET") return { status: 405, body: { error: "Send a GET." } };
    return service.oauthCallback(oauth[1], request.query ?? {});
  }
  if (request?.method !== "POST") return { status: 405, body: { error: "Send a POST." } };
  if (path === "/shop") return service.shopCall({ headers: request.headers, body: request.body });
  return { status: 404, body: { error: "No such door." } };
}
