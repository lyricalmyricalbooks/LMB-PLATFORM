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
//   POST /api/control/apps/brand        { appId, brand } -> { app }        a kit logo on Colophon's own apps; "" takes it off
// Installing (26.2), for a shop's team (signed in):
//   POST /api/apps/install/preview      { appId, shopId, returnAddress } -> { app, permissions, canApprove, ... }
//   POST /api/apps/install/approve      { appId, shopId, returnAddress, state } -> { redirect }   owner only
//   POST /api/apps/install/remove       { appId, shopId } -> { removed }                          owner only
//   POST /api/apps/installed            { shopId } -> { apps }
// For the app itself (public, proves itself with its secret):
//   POST /api/apps/oauth/token          { appId, secret, code, returnAddress } -> { accessToken, shopId, scopes }
// For a shop's own server (public, proves itself with its service key; shopDoor.js):
//   POST /api/apps/shop                 { op, args } -> installed apps, the store, or remove one (Settings › Apps)

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
    "POST /api/control/apps/brand": (claims, request) => makers.setBrand(claims, body(request)),
  };
}

export function appStorePublicRoutes(makers) {
  return {
    "GET /api/apps/permissions": async () => makers.permissions(),
    "GET /api/apps/store": async (request) => makers.storeList({ category: typeof request.query?.category === "string" ? request.query.category : undefined }),
  };
}

export function appInstallRoutes(installs) {
  return {
    "POST /api/apps/install/preview": (claims, request) => installs.preview(claims, body(request)),
    "POST /api/apps/install/approve": (claims, request) => installs.approve(claims, body(request)),
    "POST /api/apps/install/remove": (claims, request) => installs.remove(claims, body(request)),
    "POST /api/apps/installed": (claims, request) => installs.forShop(claims, body(request)),
  };
}

export function appShopDoorRoutes(door) {
  return {
    "POST /api/apps/shop": async (request) => door.shopCall(request),
  };
}

export function appInstallPublicRoutes(installs) {
  return {
    "POST /api/apps/oauth/token": async (request) => installs.exchange(body(request)),
  };
}
