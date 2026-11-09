// The Chit Chats app's calls on the platform's one web door (signup/api.js), code plan 26.11.
//
// For a shop's owner (signed in), from the connect page (accounts/chitchats.html):
//   POST /api/chitchats/connect      { shopId, code?, clientId, accessToken, parcel } -> { connected, clientId, parcel }
//   POST /api/chitchats/status       { shopId } -> { connected, clientId?, parcel, waiting?, lastProblem? }
//   POST /api/chitchats/disconnect   { shopId } -> { removed }
//   POST /api/chitchats/emails       { shopId, on } -> { emails }   the morning email about late or refused orders
// For the platform's own alerts (public, signed like every app alert):
//   POST /api/chitchats/alerts       the alert body -> { ... }
const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});

export function chitChatsRoutes(chitchats) {
  return {
    "POST /api/chitchats/connect": (claims, request) => chitchats.connect(claims, body(request)),
    "POST /api/chitchats/status": (claims, request) => chitchats.status(claims, body(request)),
    "POST /api/chitchats/disconnect": (claims, request) => chitchats.disconnect(claims, body(request)),
    "POST /api/chitchats/emails": (claims, request) => chitchats.setEmails(claims, body(request)),
  };
}

export function chitChatsPublicRoutes(chitchats) {
  return {
    "POST /api/chitchats/alerts": async (request) => chitchats.alert(request),
  };
}
