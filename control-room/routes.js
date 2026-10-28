// The control room's calls on the platform's one web door (signup/api.js `routes`). Platform admins only.
//
//   GET  /api/control/shops    every shop: plan, version, health, switches
//   POST /api/control/act-as   { shopId, reason } -> { url, expiresAt }: logged before the sign-in is made
//   POST /api/control/switch   { shopId, name, on, reason }: one switch, then the shop's profile is re-published
//   POST /api/control/repairs  { status: "open" | "fixed" }: the repair queue
//   POST /api/control/repairs/fixed  { id, note }: a person marks a repair fixed
//   POST /api/control/check    { shopId }: run the self-checks now

export function controlRoutes(room) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/shops": (claims) => room.shops(claims),
    "POST /api/control/act-as": (claims, request) => room.actAs(claims, body(request)),
    "POST /api/control/switch": (claims, request) => room.switch(claims, body(request)),
    "POST /api/control/repairs": (claims, request) => room.repairs(claims, body(request)),
    "POST /api/control/repairs/fixed": (claims, request) => room.markFixed(claims, body(request)),
    "POST /api/control/check": (claims, request) => room.checkNow(claims, body(request)),
  };
}
