// The control room's calls on the platform's one web door (signup/api.js `routes`). Platform admins only.
//
//   GET  /api/control/shops    every shop: plan, version, health, switches
//   POST /api/control/act-as   { shopId, reason } -> { url, expiresAt }: logged before the sign-in is made
//   POST /api/control/switch   { shopId, name, on, reason }: one switch, then the shop's profile is re-published

export function controlRoutes(room) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/shops": (claims) => room.shops(claims),
    "POST /api/control/act-as": (claims, request) => room.actAs(claims, body(request)),
    "POST /api/control/switch": (claims, request) => room.switch(claims, body(request)),
  };
}
