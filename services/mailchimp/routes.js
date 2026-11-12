// The Mailchimp app's calls on the platform's one web door (signup/api.js), code plan 26.12.
//
// For a shop's owner (signed in), from the connect page (accounts/mailchimp.html):
//   POST /api/mailchimp/status       { shopId } -> { available, connected, stage, audience?, lists?, added, lastSyncAt, lastProblem }
//   POST /api/mailchimp/begin        { shopId, code? } -> { url }   Mailchimp's "allow Colophon" page
//   POST /api/mailchimp/finish       { shopId, code, state } -> status   back from Mailchimp
//   POST /api/mailchimp/lists        { shopId } -> { lists: [{ id, name, members }], current }
//   POST /api/mailchimp/audience     { shopId, listId } -> status
//   POST /api/mailchimp/disconnect   { shopId } -> { removed }
// For the platform's own alerts (public, signed like every app alert):
//   POST /api/mailchimp/alerts       the alert body
const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});

export function mailchimpRoutes(mailchimp) {
  return {
    "POST /api/mailchimp/status": (claims, request) => mailchimp.status(claims, body(request)),
    "POST /api/mailchimp/begin": (claims, request) => mailchimp.begin(claims, body(request)),
    "POST /api/mailchimp/finish": (claims, request) => mailchimp.finish(claims, body(request)),
    "POST /api/mailchimp/lists": (claims, request) => mailchimp.lists(claims, body(request)),
    "POST /api/mailchimp/audience": (claims, request) => mailchimp.pickAudience(claims, body(request)),
    "POST /api/mailchimp/disconnect": (claims, request) => mailchimp.disconnect(claims, body(request)),
  };
}

export function mailchimpPublicRoutes(mailchimp) {
  return { "POST /api/mailchimp/alerts": async (request) => mailchimp.alert(request) };
}
