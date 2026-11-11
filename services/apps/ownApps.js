// Colophon's own apps (code plan 26.11-26.13, docs/app-store.md › Colophon's own apps): the apps the platform team builds
// itself on the same app store plumbing any maker uses. They put themselves on the store, so no one has to register,
// approve or configure them by hand before a press can add one.
//
//   createOwnApps({ store, root, platformUrl, supportEmail, now })  ->  { ensure(), appOf(name), sealKeyOf(name), list() }
//
// - Each app's id is fixed (`ownAppId(name)`), and its secret and sealing key come from one platform secret (`root`, the
//   CHECKUP_SECRET link phrase the server already needs, or OWN_APPS_SECRET when set), each through its own HMAC label.
//   Nothing new has to be put in Secret Manager, and the same secret always gives the same app secret, so `ensure` is
//   safe to run any number of times. Changing `root` means presses connect these apps again.
// - `ensure()` writes the app as listed and approved by "Colophon", keeping its history. It changes the listing only when
//   its details changed, and it never puts back an app an admin took off the store.
// - The store copy is checked by the same rules as any maker's (makers.js detailsFrom), with a company logo allowed.
//
// Clients passed in:
//   store  services/apps/makers.js's store: get(appId); put(appId, app)
import { createHash, createHmac } from "node:crypto";
import { detailsFrom } from "./makers.js";

const sha256 = (text) => createHash("sha256").update(String(text), "utf8").digest("hex");
const hmac = (root, label) => createHmac("sha256", String(root)).update(label, "utf8").digest();

/** The fixed id of one of Colophon's own apps (an app id like any other: app_ and 16 hex). */
export const ownAppId = (name) => `app_${sha256(`colophon own app ${name}`).slice(0, 16)}`;
/** Its secret, from the platform's root secret. */
export const ownAppSecret = (root, name) => `cs_${hmac(root, `own app secret ${name}`).toString("hex")}`;
/** The 32-byte key it seals presses' details with (services/payments/tokenSeal.js). */
export const ownSealKey = (root, name) => hmac(root, `own app seal ${name}`);

/** What each app asks for and says on the store. `url` is the platform's address. */
export function ownAppSpecs(url, supportEmail) {
  return {
    chitchats: {
      name: "Chit Chats",
      tagline: "Cheaper Canadian postage. Paid orders go to Chit Chats, tracking comes back.",
      description: [
        "Each paid order shows up in your Chit Chats account, ready for postage. Pick the service and print the label on Chit Chats, as you do today.",
        "Once the parcel is on its way, the order is marked sent here and your customer gets their tracking email.",
        "You need a Chit Chats account. Pickup and digital orders are left out.",
      ].join("\n\n"),
      category: "orders-shipping",
      website: "https://chitchats.com/",
      installAddress: `${url}/account/chitchats.html`,
      returnAddresses: [`${url}/account/chitchats.html`],
      alertsAddress: `${url}/api/chitchats/alerts`,
      scopes: ["write_orders"],
      alertTopics: ["orders/paid", "app/uninstalled"],
      supportEmail,
    },
  };
}

export function createOwnApps({ store, root, platformUrl, supportEmail, now = () => new Date() }) {
  const ready = typeof root === "string" && root.length >= 16;
  const specs = ownAppSpecs(platformUrl, supportEmail);
  let running = null;

  async function ensureOne(name) {
    const details = detailsFrom(specs[name], {}, { mayUseBrand: true });
    const appId = ownAppId(name);
    const secretHash = sha256(ownAppSecret(root, name));
    const at = now().toISOString();
    const before = await store.get(appId);
    const same = before && JSON.stringify(before.listing?.details ?? null) === JSON.stringify(details) && before.secretHash === secretHash;
    if (same) return { appId, changed: false };
    // A logo the team set from the control room (makers.setBrand) stays.
    const brand = before?.listing?.details?.brand;
    if (brand && !details.brand) details.brand = brand;
    const takenOff = before?.status === "unlisted";
    const app = {
      ...(before ?? { createdAt: at, history: [] }),
      appId, ownApp: true, makerEmail: supportEmail, makerName: "Colophon", makerAccountId: null,
      draft: details, review: null, secretHash, secretSetAt: before?.secretHash === secretHash ? before.secretSetAt : at,
      listing: { details, approvedAt: at, approvedBy: "colophon", firstApprovedAt: before?.listing?.firstApprovedAt ?? at },
      status: takenOff ? "unlisted" : "listed", onStore: !takenOff, updatedAt: at,
    };
    app.history = [...(app.history ?? []), { at, by: "colophon", what: before ? "updated Colophon's own app" : "listed Colophon's own app" }].slice(-50);
    await store.put(appId, app);
    return { appId, changed: true };
  }

  return {
    ready,
    names: Object.keys(specs),
    /** Puts every own app on the store (once at a time; a failure is tried again on the next call). */
    async ensure() {
      if (!ready) return { listed: [] };
      running ??= (async () => {
        const listed = [];
        for (const name of Object.keys(specs)) listed.push(await ensureOne(name));
        return { listed };
      })().catch((error) => {
        running = null;
        throw error;
      });
      return running;
    },
    /** The app id and secret one app uses to install and to check its alerts, or null without a root secret. */
    appOf(name) {
      return ready && specs[name] ? { appId: ownAppId(name), appSecret: ownAppSecret(root, name) } : null;
    },
    sealKeyOf(name) {
      return ready && specs[name] ? ownSealKey(root, name) : null;
    },
  };
}
