// The shop's door to the app store (platform plan 26.5): a shop's own server asks, for an admin signed in to its admin,
// which apps are installed, what the store offers, and to remove one (Settings › Apps). The shop proves who it is with
// its service key, like the email, domain and Google doors: `X-Shop-Id` + `Authorization: Bearer <service key>`, body
// { op, args }. The shop has already checked that the person is one of its admins.
//
//   apps.installed               { apps: [{ appId, name, tagline, category, permissions, installedAt, supportEmail, website }] }
//   apps.store  { category? }    { apps: [...store copy], categories: [{ id, name }] }
//   apps.remove { appId, by }    { removed: true }   the app's key stops working at once; `by` is the admin's email
//
//   createAppShopDoor({ registry, installs, makers })  ->  shopCall(request)
import { serviceKeyMatches } from "../email/http.js";
import { SignupError } from "../../signup/signup.js";

const header = (headers, name) => {
  const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return typeof found?.[1] === "string" ? found[1] : "";
};

export function createAppShopDoor({ registry, installs, makers }) {
  const OPS = {
    "apps.installed": async (shopId) => ({ apps: await installs.installedOn(shopId) }),
    "apps.store": async (_shopId, args) => {
      const category = typeof args.category === "string" ? args.category : undefined;
      const { categories } = makers.permissions();
      return { ...(await makers.storeList({ category })), categories };
    },
    "apps.remove": async (shopId, args) => {
      if (typeof args.appId !== "string" || !args.appId) throw new SignupError(400, "Pick an app.");
      return installs.removeForShop(shopId, args.appId, typeof args.by === "string" ? args.by : "");
    },
  };

  return {
    async shopCall(request = {}) {
      const shopId = header(request.headers, "x-shop-id");
      const row = shopId ? await registry.getShop(shopId) : null;
      // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
      if (!row || !serviceKeyMatches(header(request.headers, "authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
        throw new SignupError(401, "This shop can't reach the app store.");
      }
      if (row.status === "abandoned") throw new SignupError(403, "This shop is closed.");
      const body = request.body && typeof request.body === "object" ? request.body : {};
      const op = Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
      if (!op) throw new SignupError(400, "Unknown call.");
      const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
      return op(shopId, args);
    },
  };
}
