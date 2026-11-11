// Colophon's own apps (code plan 26.11-26.13, docs/app-store.md › Colophon's own apps): the apps the platform team builds
// itself on the same app store plumbing any maker uses. They put themselves on the store, so no one has to register,
// approve or configure them by hand before a press can add one.
//
//   createOwnApps({ store, root, platformUrl, supportEmail, available, zapier, now })  ->  { ensure(), appOf(name), sealKeyOf(name), list() }
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

/**
 * What each app asks for and says on the store. `url` is the platform's address. `zapier` is where Colophon's app lives
 * on Zapier once it's pushed there: its invite link (where Add sends the press) and the address Zapier gets presses
 * back at (services/zapier/README.md).
 */
export function ownAppSpecs(url, supportEmail, { zapier = {} } = {}) {
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
    mailchimp: {
      name: "Mailchimp",
      tagline: "Your newsletter readers in your Mailchimp audience, and back out when they unsubscribe.",
      description: [
        "People who confirm your shop's newsletter join your Mailchimp audience, tagged \"Shop newsletter\". When one of them buys, they're tagged \"Customer\" and with what they bought, so you can send to them in Mailchimp.",
        "Unsubscribes go both ways: leave in Mailchimp and you stop emailing them from your shop too, and the other way round.",
        "Only people who said yes to your newsletter are ever sent. You need a Mailchimp account.",
      ].join("\n\n"),
      category: "marketing",
      website: "https://mailchimp.com/",
      brand: "mailchimp",
      installAddress: `${url}/account/mailchimp.html`,
      returnAddresses: [`${url}/account/mailchimp.html`],
      alertsAddress: `${url}/api/mailchimp/alerts`,
      scopes: ["read_orders", "write_customers"],
      alertTopics: ["orders/paid", "app/uninstalled"],
      supportEmail,
    },
    zapier: {
      name: "Zapier",
      tagline: "Link your shop to thousands of other apps, with no code.",
      description: [
        "New paid orders, newsletter readers and product changes can start a Zap: add a row to a spreadsheet, send a message to your team, make an invoice, and more.",
        "Zaps can also mark an order sent with its tracking, or add and take copies of a product.",
        "You need a Zapier account. Pick Colophon when you make a Zap, and sign in here to connect your shop.",
      ].join("\n\n"),
      category: "other",
      website: "https://zapier.com/",
      brand: "zapier",
      // Until the app is on Zapier these stay on the platform; Zapier stays off the store until then (createOwnApps).
      installAddress: zapier.inviteUrl || `${url}/account/`,
      returnAddresses: [zapier.returnAddress || `${url}/account/`],
      scopes: ["read_shop", "read_orders", "write_orders", "read_customers", "read_products", "write_inventory"],
      alertTopics: [],
      supportEmail,
    },
  };
}

export function createOwnApps({ store, root, platformUrl, supportEmail, available = {}, zapier = {}, now = () => new Date() }) {
  const ready = typeof root === "string" && root.length >= 16;
  const specs = ownAppSpecs(platformUrl, supportEmail, { zapier });
  // An app that still needs something from its company (Mailchimp's own app sign-up) stays off the store until it has
  // it, so every app a press can find can really connect. Missing from `available` means ready.
  // Zapier also needs to be on Zapier first (its two addresses).
  const canConnect = (name) => available[name] !== false && (name !== "zapier" || Boolean(zapier.inviteUrl && zapier.returnAddress));
  let running = null;

  async function ensureOne(name) {
    const details = detailsFrom(specs[name], {}, { mayUseBrand: true });
    const appId = ownAppId(name);
    const secretHash = sha256(ownAppSecret(root, name));
    const at = now().toISOString();
    const before = await store.get(appId);
    // Taken off by us while it can't connect; it comes back once it can.
    if (!canConnect(name)) {
      if (!before || !before.onStore) return { appId, changed: false, waiting: true };
      await store.put(appId, { ...before, status: "unlisted", onStore: false, unlisted: { by: "colophon", at, reason: "Waiting for its company to finish setting up." }, updatedAt: at });
      return { appId, changed: true, waiting: true };
    }
    const same = before && before.onStore && JSON.stringify(before.listing?.details ?? null) === JSON.stringify(details) && before.secretHash === secretHash;
    if (same) return { appId, changed: false };
    // A logo the team set from the control room (makers.setBrand) stays.
    const brand = before?.listing?.details?.brand;
    if (brand && !details.brand) details.brand = brand;
    // Taken off by the team stays off; taken off by us because it couldn't connect comes back once it can.
    const takenOff = before?.status === "unlisted" && before.unlisted?.by !== "colophon";
    const app = {
      ...(before ?? { createdAt: at, history: [] }),
      appId, ownApp: true, makerEmail: supportEmail, makerName: "Colophon", makerAccountId: null,
      draft: details, review: null, secretHash, secretSetAt: before?.secretHash === secretHash ? before.secretSetAt : at,
      listing: { details, approvedAt: at, approvedBy: "colophon", firstApprovedAt: before?.listing?.firstApprovedAt ?? at },
      status: takenOff ? "unlisted" : "listed", onStore: !takenOff, updatedAt: at,
    };
    if (!takenOff) delete app.unlisted;
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
