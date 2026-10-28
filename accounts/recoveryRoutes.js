// Account recovery's calls on the platform's one web door (signup/api.js `routes`). Every call is signed in.
//
// For the person (accounts page):
//   POST /api/recovery/ask     { oldEmail, details } -> { request }   (signed in with the NEW address)
//   GET  /api/recovery/mine    -> { asked, againstMe }
//   POST /api/recovery/cancel  { id } -> { request }                  (the old owner stops it, or the asker withdraws)
// For platform admins (control room):
//   POST /api/control/recovery          { status } -> { requests }
//   POST /api/control/recovery/approve  { id, note } -> { request }
//   POST /api/control/recovery/deny     { id, reason } -> { request }
//   POST /api/control/recovery/apply    { id, doneByHand } -> { request }

export function recoveryRoutes(recovery) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/recovery/ask": (claims, request) => recovery.ask(claims, body(request)),
    "GET /api/recovery/mine": (claims) => recovery.mine(claims),
    "POST /api/recovery/cancel": (claims, request) => recovery.cancel(claims, body(request)),
    "POST /api/control/recovery": (claims, request) => recovery.queue(claims, body(request)),
    "POST /api/control/recovery/approve": (claims, request) => recovery.approve(claims, body(request)),
    "POST /api/control/recovery/deny": (claims, request) => recovery.deny(claims, body(request)),
    "POST /api/control/recovery/apply": (claims, request) => recovery.apply(claims, body(request)),
  };
}
