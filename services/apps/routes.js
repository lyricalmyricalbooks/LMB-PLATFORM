// The app makers' calls on the platform's one web door (signup/api.js), code plan 26.1. docs/app-store.md has the table.
//
// Public (no sign-in):
//   GET  /api/apps/permissions          -> { permissions, categories }
//   GET  /api/apps/store?category=      -> { apps }   approved copies only
// For app makers (signed in):
//   POST /api/apps/maker/create         { name, tagline, description, category, supportEmail, website, alertsAddress, returnAddresses, scopes, requestId } -> { app, secret }
//   GET  /api/apps/maker/mine           -> { apps }
//   POST /api/apps/maker/update         { appId, ...fields } -> { app }
//   POST /api/apps/maker/secret         { appId } -> { app, secret }
//   POST /api/apps/maker/submit         { appId } -> { app }
// For platform admins (control room):
//   POST /api/control/apps              { status } -> { apps }
//   POST /api/control/apps/approve      { appId } -> { app }
//   POST /api/control/apps/send-back    { appId, reason } -> { app }
//   POST /api/control/apps/unlist       { appId, reason } -> { app }

const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});

export function appMakerRoutes(makers) {
  return {
    "POST /api/apps/maker/create": (claims, request) => makers.create(claims, body(request)),
    "GET /api/apps/maker/mine": (claims) => makers.mine(claims),
    "POST /api/apps/maker/update": (claims, request) => makers.update(claims, body(request)),
    "POST /api/apps/maker/secret": (claims, request) => makers.replaceSecret(claims, body(request)),
    "POST /api/apps/maker/submit": (claims, request) => makers.submit(claims, body(request)),
    "POST /api/control/apps": (claims, request) => makers.list(claims, body(request)),
    "POST /api/control/apps/approve": (claims, request) => makers.approve(claims, body(request)),
    "POST /api/control/apps/send-back": (claims, request) => makers.sendBack(claims, body(request)),
    "POST /api/control/apps/unlist": (claims, request) => makers.unlist(claims, body(request)),
  };
}

export function appStorePublicRoutes(makers) {
  return {
    "GET /api/apps/permissions": async () => makers.permissions(),
    "GET /api/apps/store": async (request) => makers.storeList({ category: typeof request.query?.category === "string" ? request.query.category : undefined }),
  };
}
