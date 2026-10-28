// The control room's calls on the platform's one web door (signup/api.js `routes`). Platform admins only.
//
//   GET  /api/control/today    the numbers, monthly income and what needs a person (plan 9.2)
//   POST /api/control/shop     { shopId }: one shop's record (9.3)
//   POST /api/control/fee      { shopId, basisPoints, refunded, reason }: the shop's per-order fee, 30 days' notice (9.6)
//   POST /api/control/switch-all  { name, on, reason }: one switch for every live shop (9.7)
//   GET/POST /api/control/new-shop-switches  the switches new shops start with (9.7)
//   GET  /api/control/shops    every shop: plan, version, health, switches
//   POST /api/control/act-as   { shopId, reason } -> { url, expiresAt }: logged before the sign-in is made
//   POST /api/control/switch   { shopId, name, on, reason }: one switch, then the shop's profile is re-published
//   POST /api/control/repairs  { status: "open" | "fixed" }: the repair queue
//   POST /api/control/repairs/fixed  { id, note }: a person marks a repair fixed
//   POST /api/control/check    { shopId }: run the self-checks now
//   POST /api/control/close    { shopId, reason }: close a shop's checkout and pages for abuse (plan 8.4)
//   POST /api/control/reopen   { shopId, reason }: open them again
//   POST /api/control/payments { shopId | all: true, to: "own" | "square" | "platform", reason }: the emergency
//                              payments switch (plan 8.5)
//   POST /api/control/breaches         the breach register and the privacy contact (plan 8.6)
//   POST /api/control/breaches/record  { foundOn, what, shops, people, reportedToCommissioner, peopleTold }
//   POST /api/control/breaches/update  { id, reportedToCommissioner?, peopleTold?, note? }
//   POST /api/control/newsletter/resume  { shopId, reason }: turn a paused newsletter back on

export function controlRoutes(room) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/today": (claims) => room.today(claims),
    "POST /api/control/shop": (claims, request) => room.shop(claims, body(request)),
    "POST /api/control/fee": (claims, request) => room.setFee(claims, body(request)),
    "POST /api/control/switch-all": (claims, request) => room.switchAll(claims, body(request)),
    "GET /api/control/new-shop-switches": (claims) => room.newShopSwitches(claims),
    "POST /api/control/new-shop-switches": (claims, request) => room.setNewShopSwitch(claims, body(request)),
    "GET /api/control/shops": (claims) => room.shops(claims),
    "GET /api/control/test-shop": (claims) => room.testShop(claims),
    "POST /api/control/test-shop/reset": (claims, request) => room.resetTestShop(claims, body(request)),
    "POST /api/control/google-run-again": (claims, request) => room.googleRunAgain(claims, body(request)),
    "POST /api/control/act-as": (claims, request) => room.actAs(claims, body(request)),
    "POST /api/control/switch": (claims, request) => room.switch(claims, body(request)),
    "POST /api/control/repairs": (claims, request) => room.repairs(claims, body(request)),
    "POST /api/control/repairs/fixed": (claims, request) => room.markFixed(claims, body(request)),
    "POST /api/control/check": (claims, request) => room.checkNow(claims, body(request)),
    "POST /api/control/close": (claims, request) => room.closeShop(claims, body(request)),
    "POST /api/control/reopen": (claims, request) => room.reopenShop(claims, body(request)),
    "POST /api/control/payments": (claims, request) => room.movePayments(claims, body(request)),
    "POST /api/control/breaches": (claims) => room.breaches(claims),
    "POST /api/control/breaches/record": (claims, request) => room.recordBreach(claims, body(request)),
    "POST /api/control/breaches/update": (claims, request) => room.updateBreach(claims, body(request)),
    "POST /api/control/newsletter/resume": (claims, request) => room.resumeNewsletter(claims, body(request)),
  };
}
