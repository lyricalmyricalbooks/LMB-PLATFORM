// App makers register outside apps that can link to presses' shops (code plan 26.1, docs/app-store.md), like a partner
// account on the big platforms. Approved apps show in the store; installing one comes in 26.2.
//
//   createAppMakers({ store, admins, now, newId, newSecret })
//
// Who may do what:
// - Any signed-in person with a confirmed email registers up to MAX_APPS_PER_MAKER apps and changes their own.
// - Platform admins (control room, PLATFORM_ADMIN_EMAILS, with two-step) approve, send back and take apps off the store.
// - Anyone reads the store (approved copies only) and the list of permissions.
//
// An app keeps two copies of its details: `draft`, which the maker edits, and `listing`, the copy an admin approved,
// which is the only one the store shows. Editing a listed app never changes what presses see until the edit is approved.
//
// The app's secret is shown once, when it is made or replaced; only its SHA-256 fingerprint is kept.
//
// Clients passed in:
//   store  get(appId); put(appId, app); listByMaker(email); listByStatus(status); listOnStore()
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { adminOf } from "../../control-room/controlRoom.js";
import { SignupError, personOf } from "../../signup/signup.js";
import { cleanScopes, grantedScopes, scopeList, scopeWords } from "./scopes.js";
import { TOPICS } from "./topics.js";
import { publicAlertAddress } from "./alerts.js";

export const MAX_APPS_PER_MAKER = 10;
export const MAX_RETURN_ADDRESSES = 5;
export const STATUSES = Object.freeze(["draft", "in-review", "listed", "unlisted"]);
export const CATEGORIES = Object.freeze({
  "orders-shipping": "Orders and shipping",
  marketing: "Marketing and email",
  "customer-service": "Customer service",
  accounting: "Accounting and taxes",
  products: "Products and stock",
  website: "Website and design",
  "in-person": "Selling in person",
  other: "Something else",
});
export const LIMITS = Object.freeze({ name: 60, tagline: 100, description: 4000, reason: 1000 });
const HISTORY_KEPT = 50;
const ID = /^app_[a-f0-9]{12,32}$/;

const clean = (value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "");
const oneLine = (value) => clean(value).replace(/\s+/g, " ");
const fingerprint = (secret) => createHash("sha256").update(String(secret), "utf8").digest();

/** A local address, allowed as a return address while an app is being built. */
const isLocal = (url) => url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);

function webAddress(text, { allowLocal = false } = {}) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash) return null;
  if (url.protocol !== "https:" && !(allowLocal && isLocal(url))) return null;
  return url.href;
}

/** The maker's details, checked; throws with each problem by field. Fields left out keep `before`'s values. */
function detailsFrom(input, before = {}) {
  const pick = (field) => (Object.hasOwn(input, field) ? input[field] : before[field]);
  const problems = {};
  const name = oneLine(pick("name"));
  const tagline = oneLine(pick("tagline"));
  const description = clean(pick("description"));
  const category = pick("category") ?? "other";
  const supportEmail = oneLine(pick("supportEmail")).toLowerCase();
  const websiteText = oneLine(pick("website"));
  const installText = oneLine(pick("installAddress"));
  const alertsText = oneLine(pick("alertsAddress"));
  const returnList = pick("returnAddresses");
  const scopes = cleanScopes(pick("scopes"));
  const topicList = pick("alertTopics") ?? [];

  if (name.length < 2) problems.name = "Give your app a name.";
  if (name.length > LIMITS.name) problems.name = `Keep the name under ${LIMITS.name} characters.`;
  if (tagline.length > LIMITS.tagline) problems.tagline = `Keep the tagline under ${LIMITS.tagline} characters.`;
  if (description.length > LIMITS.description) problems.description = `Keep the description under ${LIMITS.description} characters.`;
  if (!Object.hasOwn(CATEGORIES, category)) problems.category = "Pick a category from the list.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) problems.supportEmail = "Give an email address presses can write to for help.";
  const website = websiteText ? webAddress(websiteText) : "";
  if (website === null) problems.website = "Give your app's website as a full https address.";
  // Where a press starts adding the app from the store (the store adds ?shop=<shopId>), like the big platforms' app URL.
  const installAddress = installText ? webAddress(installText) : "";
  if (installAddress === null) problems.installAddress = "Give the install address as a full https address.";
  const alertsAddress = alertsText ? webAddress(alertsText) : "";
  if (alertsAddress === null || (alertsAddress && !publicAlertAddress(alertsAddress))) problems.alertsAddress = "Give the alerts address as a full https address on the public internet (not an IP number or a local name).";
  let returnAddresses = [];
  if (!Array.isArray(returnList) || returnList.length === 0) {
    problems.returnAddresses = "Give at least one address to send presses back to after they install your app.";
  } else if (returnList.length > MAX_RETURN_ADDRESSES) {
    problems.returnAddresses = `Give at most ${MAX_RETURN_ADDRESSES} return addresses.`;
  } else {
    returnAddresses = returnList.map((text) => webAddress(oneLine(text), { allowLocal: true }));
    if (returnAddresses.includes(null)) problems.returnAddresses = "Each return address must be a full https address (or a local one while you build).";
    returnAddresses = [...new Set(returnAddresses)];
  }
  if (!scopes) problems.scopes = "Pick permissions from the list.";
  else if (scopes.length === 0) problems.scopes = "Pick at least one thing your app needs to see or change.";

  let alertTopics = [];
  if (!Array.isArray(topicList) || topicList.some((topic) => typeof topic !== "string" || !Object.hasOwn(TOPICS, topic))) {
    problems.alertTopics = "Pick alerts from the list.";
  } else {
    alertTopics = Object.keys(TOPICS).filter((topic) => topicList.includes(topic));
    const granted = grantedScopes(scopes ?? []);
    const missing = alertTopics.filter((topic) => TOPICS[topic].needs && !granted.includes(TOPICS[topic].needs));
    if (missing.length) problems.alertTopics = `These alerts need a permission your app doesn't ask for: ${missing.map((t) => `${t} needs ${TOPICS[t].needs}`).join(", ")}.`;
    else if (alertTopics.length && !alertsAddress) problems.alertsAddress = "Give the address to send alerts to.";
  }

  if (Object.keys(problems).length) throw new SignupError(400, "Check the highlighted fields.", problems);
  return { name, tagline, description, category, supportEmail, website, installAddress, alertsAddress, alertTopics, returnAddresses, scopes };
}

const sameDetails = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What the app's maker sees: everything but the secret's fingerprint. */
function forMaker(app) {
  const { secretHash: _hidden, history: _history, ...rest } = app;
  return { ...rest, hasSecret: Boolean(app.secretHash), draftDiffers: Boolean(app.listing) && !sameDetails(app.draft, app.listing.details) };
}

/** What anyone sees in the store: the approved copy only, with the permissions in plain words. */
function forStore(app) {
  const { name, tagline, description, category, supportEmail, website, installAddress = "", scopes } = app.listing.details;
  return { appId: app.appId, name, tagline, description, category, categoryName: CATEGORIES[category], supportEmail, website, installAddress, permissions: scopeWords(scopes), listedSince: app.listing.firstApprovedAt };
}

export function createAppMakers({
  store, admins, now = () => new Date(),
  newId = () => `app_${randomBytes(8).toString("hex")}`,
  newSecret = () => `cs_${randomBytes(32).toString("hex")}`,
}) {
  const at = () => now().toISOString();
  const note = (app, by, what) => {
    app.history = [...(app.history ?? []), { at: at(), by, what }].slice(-HISTORY_KEPT);
    app.updatedAt = at();
  };

  async function load(appId) {
    return typeof appId === "string" && ID.test(appId) ? store.get(appId) : null;
  }

  async function makersApp(person, appId) {
    const app = await load(appId);
    // One answer for "no such app" and "not yours", so ids can't be fished for.
    if (!app || app.makerEmail !== person.email) throw new SignupError(404, "We couldn't find that app.");
    return app;
  }

  async function adminsApp(appId) {
    const app = await load(appId);
    if (!app) throw new SignupError(404, "There's no such app.");
    return app;
  }

  function reasonFrom(text) {
    const reason = clean(text);
    if (reason.length < 10) throw new SignupError(400, "Say why, so the maker knows what to change.", { reason: "Say why in a sentence." });
    if (reason.length > LIMITS.reason) throw new SignupError(400, `Keep the reason under ${LIMITS.reason} characters.`, { reason: "Too long." });
    return reason;
  }

  return {
    // ── Anyone ──

    permissions: () => ({ permissions: scopeList(), alertTopics: Object.entries(TOPICS).map(([topic, t]) => ({ topic, words: t.words, needs: t.needs ?? null })), categories: Object.entries(CATEGORIES).map(([id, name]) => ({ id, name })) }),

    /** Approved apps on the store, by name; `category` narrows it. */
    async storeList({ category } = {}) {
      const apps = (await store.listOnStore()).filter((app) => app.onStore && app.listing);
      return {
        apps: apps
          .map(forStore)
          .filter((app) => !category || app.category === category)
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    },

    // ── App makers ──

    /** Register an app. Answers its id and its secret; the secret is never shown again. */
    async create(claims, input = {}) {
      const person = personOf(claims);
      const details = detailsFrom(input);
      if ((await store.listByMaker(person.email)).length >= MAX_APPS_PER_MAKER) {
        throw new SignupError(429, `You have ${MAX_APPS_PER_MAKER} apps already. Remove one you don't use, or write to us for more.`);
      }
      // The same Register twice (a double press, a retry) is one app. The retry can't show the secret again.
      const requestId = typeof input.requestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(input.requestId) ? input.requestId : null;
      const appId = requestId ? `app_${createHash("sha256").update(`${person.email} ${requestId}`).digest("hex").slice(0, 16)}` : newId();
      const existing = await store.get(appId);
      if (existing) {
        if (existing.makerEmail !== person.email) throw new SignupError(409, "Try registering that again.");
        return { app: forMaker(existing), secret: null, secretNote: "This app was already registered. If you didn't keep its secret, make a new one." };
      }
      const secret = newSecret();
      const app = {
        appId, makerEmail: person.email, makerAccountId: person.accountId, makerName: person.name,
        status: "draft", onStore: false, draft: details, listing: null, review: null,
        secretHash: fingerprint(secret).toString("hex"), secretSetAt: at(), createdAt: at(), updatedAt: at(), history: [],
      };
      note(app, person.email, "registered");
      await store.put(appId, app);
      return { app: forMaker(app), secret };
    },

    async mine(claims) {
      const person = personOf(claims);
      const apps = await store.listByMaker(person.email);
      return { apps: apps.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(forMaker) };
    },

    /** Change the draft. A listed app stays on the store with its approved copy until the change is approved. */
    async update(claims, input = {}) {
      const person = personOf(claims);
      const app = await makersApp(person, input.appId);
      const details = detailsFrom(input, app.draft);
      if (sameDetails(details, app.draft)) return { app: forMaker(app) };
      app.draft = details;
      // A change while waiting for review takes it out of the queue: send it again when it's ready.
      if (app.status === "in-review" || app.status === "listed") app.status = "draft";
      if (app.listing && sameDetails(details, app.listing.details) && app.onStore) app.status = "listed";
      note(app, person.email, "changed the details");
      await store.put(app.appId, app);
      return { app: forMaker(app) };
    },

    /** A new secret; the old one stops working at once. */
    async replaceSecret(claims, { appId } = {}) {
      const person = personOf(claims);
      const app = await makersApp(person, appId);
      const secret = newSecret();
      Object.assign(app, { secretHash: fingerprint(secret).toString("hex"), secretSetAt: at() });
      note(app, person.email, "made a new secret");
      await store.put(app.appId, app);
      return { app: forMaker(app), secret };
    },

    /** Send the draft for review. */
    async submit(claims, { appId } = {}) {
      const person = personOf(claims);
      const app = await makersApp(person, appId);
      if (app.status === "in-review") return { app: forMaker(app) };
      if (app.listing && app.onStore && sameDetails(app.draft, app.listing.details)) {
        throw new SignupError(409, "This version is already on the store. Change something first.");
      }
      app.status = "in-review";
      app.review = { submittedAt: at(), sentBack: app.review?.sentBack ?? null };
      note(app, person.email, "sent for review");
      await store.put(app.appId, app);
      return { app: forMaker(app) };
    },

    // ── Platform admins, from the control room ──

    /**
     * Apps with this status (default: waiting for review), the longest waiting first. `on-store` lists every app presses
     * can find, including listed apps whose maker is changing them.
     */
    async list(claims, { status = "in-review" } = {}) {
      adminOf(claims, admins);
      if (!STATUSES.includes(status) && status !== "on-store") throw new SignupError(400, "Pick draft, in-review, listed, unlisted or on-store.");
      const apps = status === "on-store" ? (await store.listOnStore()).filter((app) => app.onStore) : await store.listByStatus(status);
      return { apps: apps.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1)).map((app) => ({ ...forMaker(app), history: app.history ?? [] })) };
    },

    /** The draft becomes the copy on the store. */
    async approve(claims, { appId } = {}) {
      const by = adminOf(claims, admins);
      const app = await adminsApp(appId);
      if (app.status !== "in-review") throw new SignupError(409, "Only an app waiting for review can be approved.");
      app.listing = { details: structuredClone(app.draft), approvedAt: at(), approvedBy: by, firstApprovedAt: app.listing?.firstApprovedAt ?? at() };
      Object.assign(app, { status: "listed", onStore: true, review: { ...app.review, sentBack: null, decidedAt: at() } });
      note(app, by, "approved");
      await store.put(app.appId, app);
      return { app: forMaker(app) };
    },

    /** Back to the maker with a reason. An approved copy already on the store stays there. */
    async sendBack(claims, { appId, reason } = {}) {
      const by = adminOf(claims, admins);
      const app = await adminsApp(appId);
      if (app.status !== "in-review") throw new SignupError(409, "Only an app waiting for review can be sent back.");
      const why = reasonFrom(reason);
      Object.assign(app, { status: "draft", review: { ...app.review, sentBack: { reason: why, at: at(), by }, decidedAt: at() } });
      note(app, by, `sent back: ${why}`);
      await store.put(app.appId, app);
      return { app: forMaker(app) };
    },

    /** Off the store, with a reason. The maker can change it and send it for review again. */
    async unlist(claims, { appId, reason } = {}) {
      const by = adminOf(claims, admins);
      const app = await adminsApp(appId);
      if (!app.onStore) throw new SignupError(409, "That app isn't on the store.");
      const why = reasonFrom(reason);
      Object.assign(app, { status: "unlisted", onStore: false, unlisted: { reason: why, at: at(), by } });
      note(app, by, `taken off the store: ${why}`);
      await store.put(app.appId, app);
      return { app: forMaker(app) };
    },

    // ── For the install step (26.2) ──

    /** Is this the app's current secret? Compared by fingerprint in constant time. Answers the app or null. */
    async verifyClient(appId, secret) {
      const app = await load(appId);
      if (!app?.secretHash || typeof secret !== "string" || !secret) return null;
      const kept = Buffer.from(app.secretHash, "hex");
      const given = fingerprint(secret);
      return kept.length === given.length && timingSafeEqual(kept, given) ? app : null;
    },
  };
}

/**
 * May an install send the press back to this address? It must be one of the app's return addresses exactly, from the
 * copy that applies: the approved copy for presses, the draft for the app's own maker trying it on their own shop.
 */
export function returnAddressAllowed(details, address) {
  const href = typeof address === "string" ? webAddress(address, { allowLocal: true }) : null;
  return Boolean(href) && (details?.returnAddresses ?? []).includes(href);
}
