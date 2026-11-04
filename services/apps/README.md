# App store

Outside apps that link to presses' shops, like the big platforms' app stores (code plan Phase 26). The plan, the reasons
and the table of calls are in `docs/app-store.md`. Plain Node 22 ES modules, no packages; tests use an in-memory store.

## Files

- `scopes.js`: the fixed list of permissions an app can ask for, each with plain words for the press. Nothing on it can
  weaken payments, stock holds or checkout.
- `makers.js`: `createAppMakers({ store, admins })`: app makers register apps, get a secret shown once, send them for
  review; platform admins approve, send back or take them off the store. The store shows only approved copies.
- `routes.js`: the calls on the platform's web door (`appMakerRoutes`, signed in; `appStorePublicRoutes`, public).
- `fakes.js`: the in-memory store. The real one is `clients/stores.js` `firestoreApps` (`apps/<appId>`).

## Not yet

Installing an app on a shop (26.2), the app connection (26.3), alerts (26.4), apps in the shop admin and Studio (26.5,
26.6), app charges (26.7), the store pages (26.8), privacy requests (26.9) and the control-room screens (26.10).
