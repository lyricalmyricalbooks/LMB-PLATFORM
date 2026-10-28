// The support inbox's calls on the platform's one web door (signup/api.js `routes`). Every call is signed in.
//
// For a press (accounts page):
//   POST /api/support/open      { subject, body, shopId?, requestId } -> { ticket }
//   GET  /api/support/mine      -> { tickets }
//   POST /api/support/add       { id, body } -> { ticket }
// For platform admins (control room):
//   POST /api/control/support         { status } -> { tickets }
//   POST /api/control/support/answer  { id, body } -> { ticket }
//   POST /api/control/support/close   { id } -> { ticket }

export function supportRoutes(inbox) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "POST /api/support/open": (claims, request) => inbox.open(claims, body(request)),
    "GET /api/support/mine": (claims) => inbox.mine(claims),
    "POST /api/support/add": (claims, request) => inbox.addTo(claims, body(request)),
    "POST /api/control/support": (claims, request) => inbox.list(claims, body(request)),
    "POST /api/control/support/answer": (claims, request) => inbox.answer(claims, body(request)),
    "POST /api/control/support/close": (claims, request) => inbox.close(claims, body(request)),
  };
}
