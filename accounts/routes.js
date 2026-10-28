// The account page's calls on the platform's one web door (signup/api.js `routes`). Every call is signed in; each body
// is JSON. The page (accounts/app.js) uses them for the shop switcher and the team.
//
//   GET  /api/accounts/shops          every shop the person belongs to, with their role
//   POST /api/accounts/switch         { shopId } -> { url }: where to go for that shop
//   POST /api/accounts/team           { shopId } -> the team and open invites (owners only)
//   POST /api/accounts/invite         { shopId, email, role } (owners only)
//   POST /api/accounts/cancel-invite  { shopId, id } (owners only)
//   POST /api/accounts/accept         { invite }: the secret from the emailed link
//   POST /api/accounts/role           { shopId, email, role } (owners only)
//   POST /api/accounts/remove         { shopId, email } (owners only)

export function accountRoutes(accounts) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/accounts/shops": (claims) => accounts.myShops(claims),
    "POST /api/accounts/switch": (claims, request) => accounts.switchTo(claims, body(request).shopId),
    "POST /api/accounts/team": (claims, request) => accounts.team(claims, body(request).shopId),
    "POST /api/accounts/invite": (claims, request) => accounts.invite(claims, body(request)),
    "POST /api/accounts/cancel-invite": (claims, request) => accounts.cancelInvite(claims, body(request)),
    "POST /api/accounts/accept": (claims, request) => accounts.accept(claims, body(request).invite),
    "POST /api/accounts/role": (claims, request) => accounts.setRole(claims, body(request)),
    "POST /api/accounts/remove": (claims, request) => accounts.remove(claims, body(request)),
  };
}
