// Installing an outside app on a press's shop, with the owner's permission (code plan 26.2, docs/app-store.md). The same
// steps as the big platforms' install flow:
//
//   1. The app sends the press to the platform's permission page with its app id, the shop, its return address and a
//      `state` of its own. `preview` answers what the page shows: the app's name and its permissions in plain words.
//   2. The shop's owner says yes (`approve`). The platform makes a one-time code (10 minutes, single use, tied to the
//      app, the shop and the return address) and sends the press back to the app with it.
//   3. The app swaps the code, with its secret, for a key that works only for that shop and those permissions
//      (`exchange`). A code used twice is a sign it was stolen: the key made from it is taken back at once.
//   4. The owner can remove the app at any time (`remove`); its key stops working at once.
//
// Only fingerprints (SHA-256) of codes and keys are kept. Every install and removal is written to the shop's own audit
// log and the registry's events.
//
// Which copy of the app applies: the approved copy on the store, for any press; or, for the app's own maker trying it on
// a shop they own, the draft (the big platforms call this a development store).
//
//   createAppInstalls({ makers, apps, installs, codes, roleIn, registry, auditLog, now, newCode, newKey })
//
// Clients passed in:
//   makers    services/apps/makers.js (verifyClient)
//   apps      the app store (get)
//   installs  get(installId); put(installId, install); getByKeyHash(hash); listByShop(shopId); listByApp(appId)
//   codes     get(hash); put(hash, code)
//   roleIn    (person, shopId) -> role | null (accounts/accounts.js)
import { createHash, randomBytes } from "node:crypto";
import { SignupError, personOf } from "../../signup/signup.js";
import { returnAddressAllowed } from "./makers.js";
import { grantedScopes, scopeWords } from "./scopes.js";

export const CODE_MINUTES = 10;
const ID = /^app_[a-f0-9]{12,32}$/;
const SHOP = /^[a-z0-9][a-z0-9-]{1,62}$/;
const hashOf = (text) => createHash("sha256").update(String(text), "utf8").digest("hex");
export const installIdOf = (shopId, appId) => `${shopId}~${appId}`;

/** An install as the shop's team sees it. */
const forShop = (install, app) => {
  const details = (install.testing ? app?.draft : app?.listing?.details) ?? app?.listing?.details ?? app?.draft ?? {};
  return {
    appId: install.appId, name: details.name ?? install.appName, tagline: details.tagline ?? "", category: details.category ?? "other", ...(details.brand ? { brand: details.brand } : {}),
    supportEmail: details.supportEmail ?? "", website: details.website ?? "",
    permissions: scopeWords(install.scopes), installedAt: install.installedAt, installedBy: install.installedBy, testing: install.testing === true,
  };
};

export function createAppInstalls({
  apps, makers, installs, codes, roleIn, registry, auditLog, onRemoved = async () => {}, now = () => new Date(),
  newCode = () => randomBytes(24).toString("base64url"), newKey = () => `cak_${randomBytes(32).toString("base64url")}`,
}) {
  const at = () => now().toISOString();

  async function log(shopId, what, detail) {
    const entry = { id: `apps-${at()}-${what}-${randomBytes(4).toString("hex")}`, source: "apps", at: at(), what, ...detail };
    try {
      await registry.recordEvent(shopId, entry);
      if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    } catch {
      // A log that can't be written never undoes an install or a removal; the install record keeps who and when.
    }
  }

  /** The app and the copy of its details that applies for this person: the store's, or the draft for its own maker. */
  async function appFor(person, appId) {
    const app = typeof appId === "string" && ID.test(appId) ? await apps.get(appId) : null;
    if (app?.onStore && app.listing) return { app, details: app.listing.details, testing: false };
    if (app && app.makerEmail === person.email) return { app, details: app.draft, testing: true };
    throw new SignupError(404, "We couldn't find that app. It may have been taken off the store.");
  }

  async function ownerOf(person, shopId) {
    if (typeof shopId !== "string" || !SHOP.test(shopId)) throw new SignupError(400, "Pick a shop.");
    const role = await roleIn(person, shopId);
    if (role !== "owner") throw new SignupError(403, role ? "Only the shop's owner can add or remove apps." : "You're not on that shop's team.");
  }

  return {
    /** What the permission page shows. Anyone on the team can look; only the owner can say yes. */
    async preview(claims, { appId, shopId, returnAddress } = {}) {
      const person = personOf(claims);
      const { app, details, testing } = await appFor(person, appId);
      if (!returnAddressAllowed(details, returnAddress)) throw new SignupError(400, "This app sent you here from an address it hasn't registered, so we stopped. Install it again from the app store.");
      const role = typeof shopId === "string" && SHOP.test(shopId) ? await roleIn(person, shopId) : null;
      if (!role) throw new SignupError(403, "You're not on that shop's team.");
      const current = await installs.get(installIdOf(shopId, app.appId));
      const shop = (await registry.getShop?.(shopId).catch(() => null)) ?? {};
      return {
        app: { appId: app.appId, name: details.name, tagline: details.tagline, category: details.category ?? "other", brand: details.brand ?? null, website: details.website, supportEmail: details.supportEmail },
        shopId, shopName: shop.pressName ?? shopId, permissions: scopeWords(details.scopes), canApprove: role === "owner", testing,
        alreadyInstalled: current?.status === "active" ? { permissions: scopeWords(current.scopes) } : null,
      };
    },

    /** The owner says yes: answers where to send the press back to, with a one-time code. */
    async approve(claims, { appId, shopId, returnAddress, state } = {}) {
      const person = personOf(claims);
      await ownerOf(person, shopId);
      const { app, details, testing } = await appFor(person, appId);
      if (!returnAddressAllowed(details, returnAddress)) throw new SignupError(400, "This app sent you here from an address it hasn't registered, so we stopped. Install it again from the app store.");
      if (state !== undefined && (typeof state !== "string" || state.length > 500)) throw new SignupError(400, "Install it again from the app store.");
      const code = newCode();
      await codes.put(hashOf(code), {
        appId: app.appId, shopId, scopes: details.scopes, returnAddress, testing, approvedBy: person.email,
        createdAt: at(), expiresAt: new Date(now().getTime() + CODE_MINUTES * 60_000).toISOString(), usedAt: null,
      });
      const back = new URL(returnAddress);
      back.searchParams.set("code", code);
      back.searchParams.set("shop", shopId);
      if (state) back.searchParams.set("state", state);
      return { redirect: back.href };
    },

    /**
     * The app swaps a code for the shop's key (no sign-in: the app proves itself with its secret). Answers
     * { accessToken, shopId, scopes } with the key shown once.
     */
    async exchange({ appId, secret, code, returnAddress } = {}) {
      const app = await makers.verifyClient(appId, secret);
      if (!app) throw new SignupError(401, "The app id or secret is wrong.");
      const codeHash = typeof code === "string" && code ? hashOf(code) : null;
      const found = codeHash ? await codes.get(codeHash) : null;
      if (!found || found.appId !== app.appId) throw new SignupError(400, "That code isn't valid. Send the press through the install page again.");
      if (found.usedAt) {
        // A second use means someone else has the code: take back the key made from it, as the standard says.
        const install = await installs.get(installIdOf(found.shopId, found.appId));
        if (install?.status === "active" && install.fromCode === codeHash) {
          Object.assign(install, { status: "removed", keyHash: null, removedAt: at(), removedBy: "platform: install code used twice" });
          await installs.put(installIdOf(found.shopId, found.appId), install);
          await log(found.shopId, "app-key-revoked", { appId: app.appId, why: "install code used twice" });
        }
        throw new SignupError(400, "That code was already used. Send the press through the install page again.");
      }
      if (found.expiresAt < at()) throw new SignupError(400, "That code has run out. Send the press through the install page again.");
      if (found.returnAddress !== returnAddress) throw new SignupError(400, "The return address doesn't match the one the press was sent back to.");
      await codes.put(codeHash, { ...found, usedAt: at() });

      const accessToken = newKey();
      const installId = installIdOf(found.shopId, app.appId);
      const before = await installs.get(installId);
      const install = {
        installId, appId: app.appId, appName: (found.testing ? app.draft : app.listing?.details)?.name ?? app.draft.name, shopId: found.shopId,
        scopes: found.scopes, keyHash: hashOf(accessToken), fromCode: codeHash, status: "active", testing: found.testing,
        installedAt: before?.status === "active" ? before.installedAt : at(), updatedAt: at(), installedBy: found.approvedBy,
      };
      await installs.put(installId, install);
      await log(found.shopId, before?.status === "active" ? "app-permissions-updated" : "app-installed", { appId: app.appId, appName: install.appName, scopes: found.scopes, by: found.approvedBy });
      return { accessToken, shopId: found.shopId, scopes: found.scopes };
    },

    /** The owner removes an app; its key stops working at once. */
    async remove(claims, { appId, shopId } = {}) {
      const person = personOf(claims);
      await ownerOf(person, shopId);
      return removeInstall(shopId, appId, person.email);
    },

    /**
     * The same, asked by the shop's own server for an admin signed in to its admin (Settings › Apps, through the shop
     * door, shopDoor.js): the shop checked who it is; `by` is that admin's email.
     */
    removeForShop: (shopId, appId, by) => removeInstall(shopId, appId, `shop admin: ${String(by ?? "").slice(0, 200)}`),

    /** The apps installed on a shop, for its own server (shop door). */
    installedOn,

    /** The apps installed on a shop, for anyone on its team. */
    async forShop(claims, { shopId } = {}) {
      const person = personOf(claims);
      if (typeof shopId !== "string" || !SHOP.test(shopId) || !(await roleIn(person, shopId))) throw new SignupError(403, "You're not on that shop's team.");
      return { apps: await installedOn(shopId) };
    },

    authenticate,
  };

  async function installedOn(shopId) {
    const active = (await installs.listByShop(shopId)).filter((install) => install.status === "active");
    const rows = await Promise.all(active.map(async (install) => forShop(install, await apps.get(install.appId))));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function removeInstall(shopId, appId, by) {
    const id = installIdOf(shopId, String(appId ?? ""));
    const install = await installs.get(id);
    if (!install || install.status !== "active") throw new SignupError(404, "That app isn't installed on this shop.");
    Object.assign(install, { status: "removed", keyHash: null, removedAt: at(), removedBy: by, updatedAt: at() });
    await installs.put(id, install);
    try {
      await onRemoved(install);
    } catch {
      // The app is removed whatever happens to its goodbye alert.
    }
    await log(shopId, "app-removed", { appId: install.appId, appName: install.appName, by });
    return { removed: true };
  }

  /**
   * The install a key belongs to, or null: used by the app connection (26.3) on every call. An app taken off the store
   * keeps working on shops that already installed it (as on the big platforms), unless an admin stops it.
   */
  async function authenticate(accessToken) {
    if (typeof accessToken !== "string" || !accessToken.startsWith("cak_")) return null;
    const install = await installs.getByKeyHash(hashOf(accessToken));
    if (!install || install.status !== "active") return null;
    return { ...install, granted: grantedScopes(install.scopes) };
  }
}
