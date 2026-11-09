// The domain service (code plan 2.9): a press puts their shop on their own web address from the shop's settings. The
// shop's admin asks through its server (`customDomains` action) with the shop's service key, like the payment and
// email services; nothing here is reachable without it.
//
//   domains.list                 the shop's addresses and where each one stands
//   domains.add { domain }       starts connecting an address: saves it in the registry, lets it call the shop's
//                                server code (SHOP_EXTRA_ORIGINS, redeployed at the version the shop runs), then asks
//                                Firebase Hosting to serve the shop there
//   domains.check { domain }     reads Google's state: the DNS records the press still has to add or remove, then
//                                securing (the certificate), then live. Once live, the address is registered with
//                                Stripe for Apple Pay and Google Pay on the press's account (services/payments)
//   domains.makeMain { domain }  makes a working address the shop's main one (plan 5.9): emails and links
//                                (SHOP_SITE_URL, server code redeployed), the profile's siteUrl (canonical links, the
//                                sitemap, the Google feed; pages redeployed) and Apple Pay / Google Pay on it. The
//                                shop's own web.app address (or an empty domain) makes that one main again
//   domains.remove { domain }    takes an address off the shop: Hosting stops serving it, the registry drops it, and
//                                it no longer calls the server code. Refused for the main address (make another main
//                                first), so the shop always keeps a working main address; its web.app one is never
//                                removed
//   domains.renameFree { name }  a new name for the shop's free address (freeAddress.js); the one before keeps working
//   domains.connect { domain }   the one step (plan 6.15): add, then find where the press bought the domain. When that
//                                domain seller has Colophon's Domain Connect template, the answer carries a signed
//                                Allow link (`allowUrl`) for the seller's own window; otherwise a plain-words `guide`
//                                for that seller. `check` keeps both up to date until the address is live
//
// Platform-only calls (never on the shop's door), for the Google link and the own-domain sender (google/domainBridge.js):
//   applyRecords(shopId, { domain, records, purpose })  lines for "email" (6.18) or "google" (6.17), added through the
//                                same Allow: `{ waiting: true }` until the press allowed them (or typed them by hand
//                                and they show from outside), then `{ done: true }`
//   removeRecords(shopId, { domain, purpose })           forgets them (they no longer go in an Allow link or guide)
//   removeDomain(shopId, { domain, deleting })           takes the address off hosting and drops its lines. Only the
//                                6.8 deletion hook (google/teardown.js) calls it, with `deleting: true`; without it the
//                                same rules as domains.remove apply, so the main address is refused
//   allowed({ shop, domain, state, error })              the seller's window sent the press back (`GET /allowed`)
//   checkAll()                                           the sweep every few minutes: every address not live yet (and
//                                any lines still waiting) is checked, and the owner gets one email when it goes live.
//                                Once a day each live address is watched too (plan 24.4): a check, so one that stops
//                                opening the shop is noticed (the owner is emailed once it has lasted an hour), and
//                                when it is paid up until, read from the public registry: the owner is emailed 30 and
//                                7 days before (a renewal moves the date, and the warnings start over)
//
// The order matters: the address may call the server code before Hosting serves the shop there, so shoppers never
// meet a shop whose checkout is refused. Every step is safe to repeat; each change is logged in the registry and the
// shop's audit log. Every call acts only on the calling shop's own registry row and project (its service key), so no
// shop can remove or take over another shop's address.
//
// Clients passed in:
//   registry   getShop(shopId), updateShop(shopId, fields), listShops(), recordEvent(shopId, entry)
//   auditLog   write(shopId, id, entry)
//   registry   also getProfile(shopId) / saveProfile(shopId, profile): the shop profile (setup step 6)
//   hosting    getDomain(projectId, domain) -> CustomDomain | null; addDomain(projectId, domain);
//              removeDomain(projectId, domain) (clients/google.js)
//   envFiles   read(shopId) / write(shopId, text): the shop's saved server settings (setup step 8)
//   profileFiles read(shopId) / write(shopId, text): the /shop-profile.js the shop's pages ship with (setup step 6)
//   deploy     deployed(shopId, "functions" | "pages:shop") -> { version, region? } | null;
//              functions(shopId, { version, region, envFile }); pages(shopId, { version, app })
//   payments   registerPaymentDomain(shopId, domain) (services/payments/service.js); optional
//   sellers    lookup(domain) -> { zone, registrar: { name } | null, domainConnect } (sellers.js); optional;
//              expiry(domain) -> ISO date | null, when the domain is paid up until (the daily watch)
//   publicLines has(record) -> boolean: the line shows from outside (sellers.js); optional
//   domainConnect  readDomainConnectConfig(env) (config.js), or null: every press gets the guide
//   email      sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email); optional
//   freeAddress  readFreeAddressConfig(env) (freeAddress.js), or null: shops keep their web.app address
//   platformZone apply(records) (platformZone.js): the free addresses' lines in the platform's own zone; optional
//   presses      listByFreeName(name) (clients/platformStores.js), optional: a name a press in setup picked is never
//                given to another shop (freeAddress.js pickedByAnotherPress)
//
// Free addresses (freeAddress.js): connectFreeAddress(shopId) gives the shop <press name>.<shop domain> (the next number
// when the name is taken), saved as the registry row's `freeAddress`, as a domain entry with `free: true` that doesn't
// count towards the three a press may add and can't be removed by the press. Its lines go into the platform's zone on
// every check until it is live, and it becomes the main address once live, unless the press's own domain is main. A
// press's own domain brought in setup (`mainWhenLive`) takes over from the free address when it goes live.
import { randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { allowLink, fitTemplate, hostInZone, normalRecord, PURPOSES } from "./domainConnect.js";
import { guideFor, sellerName, zoneGuess } from "./sellers.js";
import { profileScript } from "../../profile/profile.js";
import { domainOrigins, domainProblem, mainAddress, MAX_DOMAINS, normalDomain, ownAddress, siteUrlOf, withExtraOrigins, withSiteUrl } from "./names.js";
import { cleanHandle, handleProblem, pickFreeAddress, pickedByAnotherPress } from "./freeAddress.js";

export class DomainError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
  }
}

const RECORD_ACTIONS = { ADD: "add", REMOVE: "remove" };

/** Where an address stands, in the press's terms, from Firebase Hosting's CustomDomain. */
export function domainState(found) {
  if (!found) return { state: "missing", records: [] };
  const records = [];
  for (const set of found.requiredDnsUpdates?.desired ?? []) {
    for (const record of set?.records ?? []) {
      const action = RECORD_ACTIONS[record?.requiredAction];
      if (action) records.push({ action, host: record.domainName ?? set.domainName ?? "", type: record.type ?? "", value: record.rdata ?? "" });
    }
  }
  const cert = found.cert?.state;
  let state = "waiting_dns";
  if (found.hostState === "HOST_CONFLICT" || found.ownershipState === "OWNERSHIP_CONFLICT") state = "conflict";
  else if (found.hostState === "HOST_ACTIVE" && (cert === "CERT_ACTIVE" || cert === "CERT_EXPIRING_SOON")) state = "live";
  else if (found.hostState === "HOST_ACTIVE") state = "securing";
  return { state, records };
}

export const DOMAIN_LIVE_EMAIL = "domain-live";
/** The shop's free address works: sent once, so the press knows the address to share. */
export const FREE_ADDRESS_LIVE_EMAIL = "free-address-live";
export const DOMAIN_EXPIRING_EMAIL = "domain-expiring";
export const DOMAIN_NOT_POINTING_EMAIL = "domain-not-pointing";
const DAY = 86_400_000;
/** How often a live address is watched. */
export const WATCH_EVERY_MS = DAY;
/** How long an address must stay off before the owner is emailed, so a passing blip never sends one. */
export const NOT_POINTING_GRACE_MS = 3_600_000;
/** Days before a domain runs out that the owner is emailed, earliest first. */
export const EXPIRY_WARNINGS = Object.freeze([30, 7]);

/**
 * The expiry warning due now for a live address, or null: the nearest warning reached, unless it went for this
 * expiry date already (an earlier one missed by the sweep is never sent late; a renewal is a new date).
 */
export function expiryDue(entry, nowMs) {
  const at = Date.parse(entry?.expiresAt ?? "");
  if (!Number.isFinite(at) || at <= nowMs) return null;
  const sent = entry.expiryWarned?.for === entry.expiresAt ? entry.expiryWarned.sent ?? {} : {};
  const due = EXPIRY_WARNINGS.filter((days) => at - nowMs <= days * DAY).at(-1);
  return due && !sent[due] ? { before: due, daysLeft: Math.ceil((at - nowMs) / DAY), sent } : null;
}
const EXTRA_PURPOSES = PURPOSES.filter((p) => p !== "hosting");
const sameLines = (a = [], b = []) => JSON.stringify(a) === JSON.stringify(b);

export function createDomainService({
  registry, auditLog, hosting, envFiles, profileFiles, deploy, payments = null, platformDomain,
  sellers = null, publicLines = null, domainConnect = null, email = null, freeAddress = null, platformZone = null, presses = null,
  newState = () => randomBytes(12).toString("hex"), now = () => Date.now(),
}) {
  const iso = () => new Date(now()).toISOString();
  /** moth-books.<shop domain> → moth-books. */
  const handleOf = (address) => (freeAddress && address.endsWith(`.${freeAddress.domain}`) ? address.slice(0, -freeAddress.domain.length - 1) : "");

  async function logChange(shopId, id, entry) {
    const full = { id, source: "domain-service", at: iso(), ...entry };
    await registry.recordEvent(shopId, full);
    await auditLog.write(shopId, id, full);
  }

  async function rowOf(shopId) {
    const row = await registry.getShop(shopId);
    if (!row) throw new DomainError(404, "unknown_shop", `${shopId} isn't in the registry`);
    return row;
  }
  const domainsOf = (row) => (Array.isArray(row.domains) ? row.domains.filter((d) => d && typeof d.name === "string") : []);
  const projectOf = (row) => row.projectId ?? row.shopId;

  async function saveEntry(shopId, name, fields) {
    const row = await rowOf(shopId);
    const domains = domainsOf(row).map((d) => (d.name === name ? { ...d, ...fields } : d));
    await registry.updateShop(shopId, { domains });
  }

  // The shop's server code accepts calls from every address the shop has (shopConfig.js allowedOrigins) and links to
  // its main address (SHOP_SITE_URL: emails, order links). Redeployed at the version the shop runs when either changes.
  async function syncServer(row) {
    const text = await envFiles.read(row.shopId);
    if (!text) return false; // setup step 8 writes it, with the registry's addresses
    const next = withSiteUrl(withExtraOrigins(text, domainOrigins(domainsOf(row))), siteUrlOf(row));
    if (next === text) return false;
    const live = await deploy.deployed(row.shopId, "functions");
    // Not deployed yet: the shop's first deploy ships the file as it is now. The file is saved after the deploy, so a
    // deploy that fails leaves it as it was and the next call deploys again.
    if (live?.version) await deploy.functions(row.shopId, { version: live.version, region: live.region ?? row.region, envFile: next });
    await envFiles.write(row.shopId, next);
    return true;
  }

  // The shop's pages link to the main address (profile `siteUrl`: canonical links, the sitemap, the Google feed). The
  // profile is shipped with the pages, so they are deployed again at the version the shop runs.
  async function syncProfile(row) {
    const saved = await registry.getProfile(row.shopId);
    if (!saved) return false; // setup step 6 writes it, with the registry's main address
    const siteUrl = siteUrlOf(row);
    const script = (await profileFiles.read(row.shopId)) ?? "";
    const profile = { ...saved, siteUrl };
    if (saved.siteUrl === siteUrl && script === profileScript(profile)) return false;
    // The pages deploy ships the saved file, so it is written first; the registry's copy is saved last, so a deploy
    // that fails is tried again by the next call.
    await profileFiles.write(row.shopId, profileScript(profile));
    const live = await deploy.deployed(row.shopId, "pages:shop");
    if (live?.version) await deploy.pages(row.shopId, { version: live.version, app: "shop" });
    await registry.saveProfile(row.shopId, profile);
    return true;
  }

  async function list(shopId) {
    const row = await rowOf(shopId);
    const main = mainAddress(row);
    return {
      domains: domainsOf(row).map(({ name, state, addedAt, paymentDomainAt, free, former, redirectTo }) => ({ name, state: state ?? "connecting", addedAt, paymentDomainAt: paymentDomainAt ?? null, main: name === main, ...(free ? { free: true } : {}), ...(former ? { former: true } : {}), ...(redirectTo ? { sendsTo: redirectTo } : {}) })),
      own: ownAddress(row),
      main,
      max: MAX_DOMAINS,
    };
  }

  async function check(shopId, domain) {
    const name = normalDomain(domain);
    const row = await rowOf(shopId);
    const entry = domainsOf(row).find((d) => d.name === name);
    if (!entry) throw new DomainError(404, "unknown_domain", "That address isn't connected to this shop.");
    const { state, records } = domainState(await hosting.getDomain(projectOf(row), name));
    const fields = {};
    // A free address's lines are the platform's to write: put in on every check until it is live.
    if (entry.free && state !== "live" && platformZone && records.length) {
      await platformZone.apply(records);
      const kept = [...(entry.zoneLines ?? [])];
      for (const r of records) if (r.action === "add" && !kept.some((k) => k.host === r.host && k.type === r.type && k.value === r.value)) kept.push({ host: r.host, type: r.type, value: r.value });
      if (kept.length !== (entry.zoneLines ?? []).length) fields.zoneLines = kept;
    }
    if (state !== entry.state) {
      fields.state = state;
      if (state === "live") {
        // The daily watch starts a day after the address goes live.
        fields.watchedAt = iso();
        await logChange(shopId, `domain-live-${name}`, { kind: "domains.live", domain: name });
      }
    }
    // A live address that stops opening the shop (plan 24.4): noted at once, and the owner is emailed once it has
    // lasted an hour, through the shop's own address (the one that still works). Live again clears it.
    if (entry.state === "live" && state !== "live" && !entry.brokeAt) {
      fields.brokeAt = iso();
      await logChange(shopId, `domain-not-pointing-${name}-${iso()}`, { kind: "domains.not-pointing", domain: name, state });
    } else if (state === "live" && entry.brokeAt) {
      Object.assign(fields, { brokeAt: null, brokenEmailedAt: null });
      await logChange(shopId, `domain-back-${name}-${iso()}`, { kind: "domains.back", domain: name });
    }
    const brokeAt = fields.brokeAt ?? (state !== "live" ? entry.brokeAt : null);
    if (brokeAt && !entry.brokenEmailedAt && email && row.ownerEmail && now() - Date.parse(brokeAt) >= NOT_POINTING_GRACE_MS) {
      const own = ownAddress(row);
      await email.sendPlatform({
        kind: DOMAIN_NOT_POINTING_EMAIL, to: row.ownerEmail, shopId, idempotencyKey: `${DOMAIN_NOT_POINTING_EMAIL}-${shopId}-${name}-${brokeAt}`,
        data: { pressName: row.pressName || shopId, domain: name, own, link: `https://${own}/admin#settings/general` },
      });
      fields.brokenEmailedAt = iso();
    }
    let paymentDomain = entry.paymentDomainAt ? "registered" : "not_yet";
    if (state === "live" && !entry.paymentDomainAt && payments && row.payments?.provider === "stripe") {
      try {
        await payments.registerPaymentDomain(shopId, name);
        fields.paymentDomainAt = iso();
        paymentDomain = "registered";
      } catch (err) {
        // The address works without it; Apple Pay and Google Pay wait for the next check.
        paymentDomain = "failed";
        console.error(`Payment domain for ${shopId} ${name} failed:`, err?.message || err);
      }
    }
    // The owner hears once, when an address connected in one step opens the shop with its padlock (plan 6.15).
    if (state === "live" && entry.connect && !entry.liveEmailedAt && email && row.ownerEmail) {
      await email.sendPlatform({
        kind: DOMAIN_LIVE_EMAIL, to: row.ownerEmail, shopId, idempotencyKey: `${DOMAIN_LIVE_EMAIL}-${shopId}-${name}`,
        data: { pressName: row.pressName || shopId, domain: name, link: `https://${name}/admin#settings/general` },
      });
      fields.liveEmailedAt = iso();
      await logChange(shopId, `domain-live-emailed-${name}`, { kind: "domains.live-emailed", domain: name });
    }
    // And once when the shop's free address works, with the address to share.
    if (state === "live" && entry.free && !entry.former && !entry.liveEmailedAt && email && row.ownerEmail) {
      await email.sendPlatform({
        kind: FREE_ADDRESS_LIVE_EMAIL, to: row.ownerEmail, shopId, idempotencyKey: `${FREE_ADDRESS_LIVE_EMAIL}-${shopId}-${name}`,
        data: { pressName: row.pressName || shopId, domain: name, link: `https://${name}/admin#settings/general` },
      });
      fields.liveEmailedAt = iso();
      await logChange(shopId, `domain-live-emailed-${name}`, { kind: "domains.live-emailed", domain: name, free: true });
    }
    // Lines typed by hand count once they show from outside.
    const extra = { ...(entry.extraRecords ?? {}) };
    let extraChanged = false;
    for (const purpose of EXTRA_PURPOSES) {
      const asked = extra[purpose];
      if (asked && !asked.appliedAt && await allShow(asked.records)) {
        extra[purpose] = { ...asked, appliedAt: iso() };
        extraChanged = true;
        await logChange(shopId, `domain-records-in-${name}-${purpose}-${iso()}`, { kind: "domains.records-in", domain: name, purpose });
      }
    }
    if (extraChanged) fields.extraRecords = extra;
    const view = connectView(shopId, { ...entry, ...fields }, state, records);
    if (view.link && !sameLines(view.link, entry.connect?.link ?? null)) fields.connect = { ...entry.connect, link: view.link };
    // An address brought in setup becomes the main one once it is live (unless the press already chose another).
    const promote = state === "live" && entry.mainWhenLive === true;
    if (promote) fields.mainWhenLive = false;
    if (Object.keys(fields).length) await saveEntry(shopId, name, fields);
    // Main only over the shop's web.app address, or over a free address: the press's own domain over any of them, and a
    // renamed free address over the one it was before.
    const mainNow = normalDomain(row.mainDomain ?? "");
    const mainIsFree = domainsOf(row).some((d) => d.free && d.name === mainNow);
    if (promote && (!mainNow || (mainIsFree && mainNow !== name && (!entry.free || name === row.freeAddress)))) {
      try { await makeMain(shopId, name); } catch (err) {
        console.error(`Making ${name} main for ${shopId} failed:`, err?.message || err);
        await saveEntry(shopId, name, { mainWhenLive: true });
      }
    }
    // The current free address works: a name it had before now sends visitors on to it (Hosting redirect), so the
    // address bar shows the new name. Never the main address (makeMain refuses an address that sends on).
    if (state === "live" && entry.free && !entry.former && typeof hosting.redirectDomain === "function") {
      const fresh = await rowOf(shopId);
      for (const old of domainsOf(fresh).filter((d) => d.free && d.former && d.redirectTo !== name && d.name !== mainAddress(fresh))) {
        try {
          await hosting.redirectDomain(projectOf(fresh), old.name, name);
          await saveEntry(shopId, old.name, { redirectTo: name });
          await logChange(shopId, `domain-sends-on-${old.name}-${name}`, { kind: "domains.sends-on", domain: old.name, to: name });
        } catch (err) {
          console.error(`Sending ${old.name} on to ${name} for ${shopId} failed:`, err?.message || err);
        }
      }
    }
    return { name, state, records, paymentDomain, ...view.answer };
  }

  async function allShow(records) {
    if (!publicLines || !records?.length) return false;
    for (const record of records) if (!(await publicLines.has(record))) return false;
    return true;
  }

  // What the press sees for an address: the Allow link for the seller's window (when the seller has Colophon's
  // template and every line fits it), and always the plain-words guide for doing it by hand. Lines still needed are
  // the shop's own while it isn't live, plus any email or Google lines not in yet.
  function connectView(shopId, entry, state, hostingRecords) {
    const connect = entry.connect ?? null;
    const zone = connect?.zone ?? zoneGuess(entry.name);
    const pending = [];
    if (state !== "live" && hostingRecords.length) pending.push({ purpose: "hosting", records: hostingRecords });
    for (const purpose of EXTRA_PURPOSES) {
      const asked = entry.extraRecords?.[purpose];
      if (asked && !asked.appliedAt) pending.push({ purpose, records: asked.records });
    }
    const base = { way: connect?.way ?? "guide", seller: connect?.seller ?? null, allowedAt: connect?.allowedAt ?? null };
    if (!pending.length) return { answer: connect ? base : {} };
    const answer = { ...base, guide: guideFor({ seller: base.seller, zone, domain: entry.name, records: pending.flatMap((p) => p.records) }) };
    if (connect?.way !== "allow" || !domainConnect || !connect.sync) return { answer: { ...answer, way: "guide" } };
    const fits = pending.map((p) => fitTemplate(p.purpose, p.records, entry.name));
    if (fits.some((f) => !f)) return { answer: { ...answer, way: "guide" } };
    const groups = fits.flatMap((f) => f.groups);
    const vars = Object.assign({}, ...fits.map((f) => f.vars));
    // The same link (and `state`) while the same lines are asked for, so a sweep doesn't make a new one each time.
    const same = connect.link && sameLines(connect.link.groups, groups) && sameLines(connect.link.vars, vars);
    const link = same ? connect.link : { state: newState(), groups, vars, purposes: pending.map((p) => p.purpose), madeAt: iso() };
    const allowUrl = allowLink({ config: domainConnect, sync: connect.sync, zone, host: hostInZone(entry.name, zone), groups, vars, state: link.state, back: { shop: shopId, domain: entry.name } });
    return { link, answer: { ...answer, allowedAt: link.allowedAt ?? null, allowUrl, window: { width: connect.sync.width ?? 750, height: connect.sync.height ?? 750 } } };
  }

  async function add(shopId, domain, { redirectTo = null } = {}) {
    const name = normalDomain(domain);
    const problem = domainProblem(name, { platformDomain });
    if (problem) throw new DomainError(400, "bad_domain", problem);
    const row = await rowOf(shopId);
    if (name === `${projectOf(row)}.web.app` || name === `${projectOf(row)}.firebaseapp.com`) throw new DomainError(400, "bad_domain", "That is already your shop's own address.");
    if (freeAddress && (name === freeAddress.domain || name.endsWith(`.${freeAddress.domain}`))) {
      throw new DomainError(400, "bad_domain", name === row.freeAddress ? "That is already your shop's free address." : "That address belongs to the platform. Use an address you own.");
    }
    const domains = domainsOf(row);
    if (!domains.some((d) => d.name === name)) {
      if (domains.filter((d) => !d.free).length >= MAX_DOMAINS) throw new DomainError(409, "too_many", `A shop can have ${MAX_DOMAINS} addresses of its own.`);
      // Held by another shop as an address, or still as the address its emails come from (services/email/ownDomain.js).
      const holder = (await registry.listShops()).find((other) => other?.shopId !== shopId
        && (domainsOf(other).some((d) => d.name === name) || other?.emailSender?.domain === name));
      if (holder) throw new DomainError(409, "in_use", "That address is already connected to another shop.");
      await registry.updateShop(shopId, { domains: [...domains, { name, state: "connecting", addedAt: iso(), ...(redirectTo ? { redirectTo } : {}) }] });
      await logChange(shopId, `domain-added-${name}`, { kind: "domains.added", domain: name, ...(redirectTo ? { redirectTo } : {}) });
    }
    if (await syncServer(await rowOf(shopId))) {
      await logChange(shopId, `domain-origins-${name}`, { kind: "domains.server-allowed", domain: name });
    }
    // A "send it to" address (www to the bare domain, as the big shop builders do) is served as a redirect by Hosting.
    if (redirectTo) await hosting.addDomain(projectOf(row), name, { redirectTo });
    else await hosting.addDomain(projectOf(row), name);
    return check(shopId, name);
  }

  async function makeMain(shopId, domain) {
    const row = await rowOf(shopId);
    let name = normalDomain(domain ?? "");
    if (name === `${projectOf(row)}.firebaseapp.com`) name = ownAddress(row);
    let paymentDomain = null;
    if (name && name !== ownAddress(row)) {
      const entry = domainsOf(row).find((d) => d.name === name);
      if (!entry) throw new DomainError(404, "unknown_domain", "That address isn't connected to this shop.");
      if (entry.redirectTo) throw new DomainError(409, "sends_on", `This address sends visitors on to ${entry.redirectTo}, so ${entry.redirectTo} is the one to make main.`);
      // Only an address that works now: a fresh look at Google's state, which also registers it for Apple Pay and Google Pay.
      const found = await check(shopId, name);
      if (found.state !== "live") throw new DomainError(409, "not_live", "This address isn't working yet. Make it your main address once it shows as Live.");
      paymentDomain = found.paymentDomain;
    } else {
      name = ownAddress(row);
    }
    const mainDomain = name === ownAddress(row) ? null : name;
    if ((row.mainDomain ?? null) !== mainDomain) {
      await registry.updateShop(shopId, { mainDomain });
      await logChange(shopId, `domain-main-${name}-${iso()}`, { kind: "domains.main", domain: name });
    }
    // Repeated every time, so a half-finished earlier call (settings saved, deploy failed) is completed.
    const fresh = await rowOf(shopId);
    if (await syncServer(fresh)) await logChange(shopId, `domain-site-url-${name}-${iso()}`, { kind: "domains.server-site-url", domain: name });
    if (await syncProfile(fresh)) await logChange(shopId, `domain-profile-${name}-${iso()}`, { kind: "domains.profile-site-url", domain: name });
    return { ...(await list(shopId)), paymentDomain };
  }

  async function remove(shopId, domain) {
    const name = normalDomain(domain);
    const row = await rowOf(shopId);
    if (name === ownAddress(row) || name === `${projectOf(row)}.firebaseapp.com`) throw new DomainError(400, "own_address", "This is the address your shop came with. It always works and can't be removed.");
    const entry = domainsOf(row).find((d) => d.name === name);
    if (!entry) {
      // Gone already (or never this shop's): only bring the server settings up to date, in case an earlier remove
      // stopped before redeploying. Nothing of another shop's is touched.
      await syncServer(row);
      throw new DomainError(404, "unknown_domain", "That address isn't connected to this shop.");
    }
    if (entry.free && !entry.former) throw new DomainError(400, "own_address", "This is your shop's free address. It always works and can't be removed.");
    if (mainAddress(row) === name) throw new DomainError(409, "is_main", "This is your shop's main address. Make another address main first, then remove this one.");
    await hosting.removeDomain(projectOf(row), name);
    if (entry.free && platformZone && entry.zoneLines?.length) await platformZone.apply(entry.zoneLines.map((l) => ({ ...l, action: "remove" })));
    // The shop's emails stop coming from orders@<this address> too (its email lines went with the entry), so the
    // address is free for whoever owns it next. The Resend domain is reused if this shop or another connects it again.
    const fields = { domains: domainsOf(row).filter((d) => d.name !== name) };
    if (row.emailSender?.domain === name) fields.emailSender = null;
    await registry.updateShop(shopId, fields);
    await logChange(shopId, `domain-removed-${name}-${iso()}`, { kind: "domains.removed", domain: name });
    if (fields.emailSender === null) await logChange(shopId, `domain-email-sender-off-${name}-${iso()}`, { kind: "domains.email-sender-off", domain: name });
    await syncServer(await rowOf(shopId));
    return { removed: name, ...(await list(shopId)) };
  }

  /**
   * The one step (plan 6.15): add, find the domain's seller, then the Allow link or the guide.
   * `main`: make it the shop's main address on its own once it is live (a domain brought in setup, shopMaker.js).
   * `www`: for a bare domain (or its www name), connect the other one too, sending visitors on to this one, so both
   * yourpress.com and www.yourpress.com open the shop. That second address never holds up the first.
   * `redirectTo`: this address sends visitors on to that one (the `www` partner).
   */
  async function connect(shopId, domain, { main = false, www = false, redirectTo = null } = {}) {
    const first = await add(shopId, domain, { redirectTo });
    const name = first.name;
    if (main && !redirectTo) {
      if (first.state === "live") {
        if (!(await rowOf(shopId)).mainDomain) return { ...first, ...(await makeMain(shopId, name)) };
      } else {
        await saveEntry(shopId, name, { mainWhenLive: true });
      }
    }
    if (www && !redirectTo) await connectPartner(shopId, name);
    if (first.state === "live") return first;
    const entry = domainsOf(await rowOf(shopId)).find((d) => d.name === name);
    let found = null;
    if (sellers) {
      try { found = await sellers.lookup(name); } catch (err) {
        console.error(`Domain seller lookup for ${name} failed:`, err?.message || err);
      }
    }
    const zone = typeof found?.zone === "string" && (name === found.zone || name.endsWith(`.${found.zone}`)) ? found.zone : zoneGuess(name);
    const dc = found?.domainConnect;
    const sync = domainConnect && dc?.hasTemplate && /^https:\/\//.test(String(dc.urlSyncUX ?? ""))
      ? { urlSyncUX: dc.urlSyncUX, width: dc.width ?? null, height: dc.height ?? null }
      : null;
    const seller = sellerName(found?.registrar?.name) ?? sellerName(dc?.providerName);
    const prev = entry?.connect ?? null;
    const next = { way: sync ? "allow" : "guide", seller, zone, sync, link: prev?.link ?? null, allowedAt: prev?.allowedAt ?? null, askedAt: prev?.askedAt ?? iso() };
    if (!prev || prev.way !== next.way || prev.seller !== next.seller || prev.zone !== next.zone || !sameLines(prev.sync, next.sync)) {
      await saveEntry(shopId, name, { connect: next });
      await logChange(shopId, `domain-connect-${name}-${next.way}-${iso()}`, { kind: "domains.connect", domain: name, way: next.way, seller });
    }
    return check(shopId, name);
  }

  /**
   * The shop's free address on the shop domain (freeAddress.js): picked once from the press's name and kept on the
   * registry row, then connected with its lines in the platform's zone. `handle`: the name the press picked in setup
   * (moth-books), used instead of its press name when it can be. `{ skipped: true }` when there is no shop domain.
   * Safe to repeat.
   */
  async function connectFreeAddress(shopId, { handle = "" } = {}) {
    if (!freeAddress || !platformZone) return { skipped: true };
    let row = await rowOf(shopId);
    let name = row.freeAddress;
    if (!name) {
      const shops = await registry.listShops();
      const taken = async (candidate) => shops.some((other) => other?.shopId !== shopId
        && (other?.freeAddress === candidate || domainsOf(other ?? {}).some((d) => d.name === candidate)))
        || pickedByAnotherPress(presses, handleOf(candidate), row.pressId ?? "");
      name = await pickFreeAddress(row.pressName || shopId, freeAddress.domain, taken, { handle });
      if (!name) throw new DomainError(409, "no_free_address", `No free address is left for ${row.pressName || shopId}.`);
      await registry.updateShop(shopId, { freeAddress: name });
      // Two shops made at the same moment can both pick a name: read again after saving, and the shop whose id sorts
      // later picks again (the other keeps it), so no name ever serves two shops.
      const clash = (await registry.listShops()).some((other) => other?.shopId && other.shopId !== shopId && other.shopId < shopId && other.freeAddress === name);
      if (clash) {
        await registry.updateShop(shopId, { freeAddress: null });
        return connectFreeAddress(shopId, { handle });
      }
      await logChange(shopId, `domain-free-address-${name}`, { kind: "domains.free-address", domain: name });
      row = await rowOf(shopId);
    }
    if (!domainsOf(row).some((d) => d.name === name)) {
      await registry.updateShop(shopId, { domains: [...domainsOf(row), { name, free: true, state: "connecting", addedAt: iso(), mainWhenLive: true }] });
      await logChange(shopId, `domain-added-${name}`, { kind: "domains.added", domain: name, free: true });
    }
    if (await syncServer(await rowOf(shopId))) await logChange(shopId, `domain-origins-${name}`, { kind: "domains.server-allowed", domain: name });
    await hosting.addDomain(projectOf(row), name);
    return check(shopId, name);
  }

  /**
   * A new free address for the shop (after a new press name, say): moth-books.<shop domain>, refused when another
   * shop has it. The one before keeps opening the shop (shared links still work) until the next change, and
   * stays main until the new one is live. Only the latest one before is kept; an earlier one is taken off.
   */
  async function renameFreeAddress(shopId, wanted) {
    if (!freeAddress || !platformZone) throw new DomainError(409, "no_free_address", "Free addresses aren't switched on yet.");
    const handle = cleanHandle(wanted);
    const problem = handleProblem(handle);
    if (problem) throw new DomainError(400, "bad_name", problem);
    let row = await rowOf(shopId);
    const before = row.freeAddress;
    if (!before) throw new DomainError(409, "not_yet", "Your shop's free address is still being set up. Try again in a few minutes.");
    // This shop's own names (the one before, say) can be taken back; another shop's never.
    const shops = await registry.listShops();
    const taken = async (candidate) => shops.some((other) => other?.shopId !== shopId
      && (other?.freeAddress === candidate || domainsOf(other ?? {}).some((d) => d.name === candidate)))
      || pickedByAnotherPress(presses, handleOf(candidate), row.pressId ?? "");
    // A name the press asks for is the name it gets, or a plain no: never a number it didn't ask for.
    const name = `${handle}.${freeAddress.domain}`;
    if (name === before) return list(shopId);
    if (await taken(name)) throw new DomainError(409, "taken", `Another shop already has ${name}. Try another name.`);
    // Only one address before the current one keeps working: an older one is taken off (never the main one).
    for (const old of domainsOf(row).filter((d) => d.free && d.former && d.name !== name && d.name !== mainAddress(row))) {
      await hosting.removeDomain(projectOf(row), old.name);
      if (old.zoneLines?.length) await platformZone.apply(old.zoneLines.map((l) => ({ ...l, action: "remove" })));
      row = await rowOf(shopId);
      await registry.updateShop(shopId, { domains: domainsOf(row).filter((d) => d.name !== old.name) });
      await logChange(shopId, `domain-removed-${old.name}-${iso()}`, { kind: "domains.removed", domain: old.name, free: true });
    }
    row = await rowOf(shopId);
    // Main is still a free address (the one before, or an older one not yet live-replaced): the new name takes over.
    const wasMain = domainsOf(row).some((d) => d.free && d.name === mainAddress(row));
    // Taking back a name that sends visitors on: it serves the shop again (Hosting has no "stop sending on", so it is
    // added afresh).
    const back = domainsOf(row).find((d) => d.name === name && d.redirectTo);
    if (back) await hosting.removeDomain(projectOf(row), name);
    const domains = domainsOf(row).map((d) => {
      if (d.name === before) return { ...d, former: true, mainWhenLive: false };
      if (d.name === name) {
        const { redirectTo: _sent, ...kept } = d;
        return { ...kept, former: false, mainWhenLive: wasMain, ...(back ? { state: "connecting" } : {}) };
      }
      return d;
    });
    if (!domains.some((d) => d.name === name)) domains.push({ name, free: true, state: "connecting", addedAt: iso(), mainWhenLive: wasMain });
    await registry.updateShop(shopId, { freeAddress: name, domains });
    await logChange(shopId, `domain-free-address-${name}-${iso()}`, { kind: "domains.free-address", domain: name, before });
    if (await syncServer(await rowOf(shopId))) await logChange(shopId, `domain-origins-${name}`, { kind: "domains.server-allowed", domain: name });
    await hosting.addDomain(projectOf(row), name);
    await check(shopId, name);
    return list(shopId);
  }

  /** The www partner of a bare domain (or the bare one of a www name), sending visitors on to `name`. */
  async function connectPartner(shopId, name) {
    let zone = zoneGuess(name);
    if (sellers) {
      try {
        const found = await sellers.lookup(name);
        if (typeof found?.zone === "string" && found.zone) zone = found.zone;
      } catch { /* the guess will do */ }
    }
    const partner = name === zone ? `www.${name}` : name === `www.${zone}` ? zone : null;
    if (!partner || domainsOf(await rowOf(shopId)).some((d) => d.name === partner)) return;
    try {
      await connect(shopId, partner, { redirectTo: name });
    } catch (err) {
      // Too many addresses, or another shop has it: the main one still connects.
      console.error(`Connecting ${partner} for ${shopId} failed:`, err?.message || err);
    }
  }

  function extraPurpose(purpose) {
    if (!EXTRA_PURPOSES.includes(purpose)) throw new DomainError(400, "bad_request", `Lines are added for ${EXTRA_PURPOSES.join(" or ")}.`);
    return purpose;
  }

  /** Email (6.18) or Google (6.17) lines, through the same Allow: done once allowed or showing from outside. */
  async function applyRecords(shopId, { domain, records, purpose } = {}) {
    extraPurpose(purpose);
    const name = normalDomain(domain);
    const entry = domainsOf(await rowOf(shopId)).find((d) => d.name === name);
    if (!entry) throw new DomainError(404, "unknown_domain", "That address isn't connected to this shop.");
    const wanted = (Array.isArray(records) ? records : []).map((r) => normalRecord(r, name)).filter((r) => r.action === "add" && r.type && r.value);
    if (!wanted.length) throw new DomainError(400, "bad_request", "No lines to add.");
    const prev = entry.extraRecords?.[purpose] ?? null;
    const same = Boolean(prev) && sameLines(prev.records, wanted);
    if (same && prev.appliedAt) return { done: true };
    const appliedAt = (await allShow(wanted)) ? iso() : null;
    if (!same || appliedAt) {
      await saveEntry(shopId, name, { extraRecords: { ...(entry.extraRecords ?? {}), [purpose]: { records: wanted, askedAt: same ? prev.askedAt : iso(), appliedAt } } });
      const kind = appliedAt ? "domains.records-in" : "domains.records-asked";
      await logChange(shopId, `${kind.replace(".", "-")}-${name}-${purpose}-${iso()}`, { kind, domain: name, purpose });
    }
    return appliedAt ? { done: true } : { waiting: true };
  }

  /** Forgets a purpose's lines. Safe to repeat; an address that's gone already is done. */
  async function removeRecords(shopId, { domain, purpose } = {}) {
    extraPurpose(purpose);
    const name = normalDomain(domain);
    const entry = domainsOf(await rowOf(shopId)).find((d) => d.name === name);
    if (!entry?.extraRecords?.[purpose]) return { done: true };
    const extraRecords = { ...entry.extraRecords };
    delete extraRecords[purpose];
    await saveEntry(shopId, name, { extraRecords });
    await logChange(shopId, `domain-records-removed-${name}-${purpose}-${iso()}`, { kind: "domains.records-removed", domain: name, purpose });
    return { done: true };
  }

  /**
   * The 6.8 deletion hook's call (google/teardown.js, with `deleting: true`): the address comes off hosting and its
   * lines are dropped, the main address too, with no redeploy (the shop's project is deleted next). Without
   * `deleting` it is domains.remove, which refuses the main address, so a running shop always keeps one that works.
   */
  async function removeDomain(shopId, { domain, deleting = false } = {}) {
    const name = normalDomain(domain);
    const row = await rowOf(shopId);
    if (!domainsOf(row).some((d) => d.name === name)) return { done: true, removed: null };
    if (deleting !== true) return { done: true, ...(await remove(shopId, name)) };
    await hosting.removeDomain(projectOf(row), name);
    const entry = domainsOf(row).find((d) => d.name === name);
    if (entry?.free && platformZone && entry.zoneLines?.length) await platformZone.apply(entry.zoneLines.map((l) => ({ ...l, action: "remove" })));
    const fields = { domains: domainsOf(row).filter((d) => d.name !== name) };
    if (normalDomain(row.mainDomain ?? "") === name) fields.mainDomain = null;
    // A deleted shop gives its free name back, so the next press with that name gets it, not a number.
    if (row.freeAddress === name) fields.freeAddress = null;
    await registry.updateShop(shopId, fields);
    await logChange(shopId, `domain-removed-at-deletion-${name}`, { kind: "domains.removed-at-deletion", domain: name });
    return { done: true, removed: name };
  }

  /** The seller's window sent the press back. Answers where to send them: their shop's web address settings. */
  async function allowed({ shop, domain, state, error } = {}) {
    const row = typeof shop === "string" && shop ? await registry.getShop(shop) : null;
    if (!row) return null;
    const shopId = row.shopId ?? shop;
    const back = `https://${mainAddress(row)}/admin#settings/general`;
    const name = normalDomain(domain);
    const entry = domainsOf(row).find((d) => d.name === name);
    const link = entry?.connect?.link;
    // Only a press coming back from the link Colophon made for this address counts.
    if (!link || typeof state !== "string" || state !== link.state || link.allowedAt) return back;
    if (error) {
      await saveEntry(shopId, name, { connect: { ...entry.connect, declinedAt: iso() } });
      await logChange(shopId, `domain-allow-declined-${name}-${iso()}`, { kind: "domains.allow-declined", domain: name });
      return back;
    }
    const at = iso();
    const extra = { ...(entry.extraRecords ?? {}) };
    for (const purpose of link.purposes ?? []) if (extra[purpose] && !extra[purpose].appliedAt) extra[purpose] = { ...extra[purpose], appliedAt: at };
    await saveEntry(shopId, name, { connect: { ...entry.connect, allowedAt: at, declinedAt: null, link: { ...link, allowedAt: at } }, extraRecords: extra });
    await logChange(shopId, `domain-allowed-${name}-${link.state}`, { kind: "domains.allowed", domain: name, purposes: link.purposes ?? [] });
    return back;
  }

  /**
   * The daily watch on a live address: a check (which notices one that stopped opening the shop), then when it is paid
   * up until, and the expiry email when one is due.
   */
  async function watch(shopId, name) {
    const found = await check(shopId, name);
    const row = await rowOf(shopId);
    const entry = domainsOf(row).find((d) => d.name === name);
    const fields = { watchedAt: iso() };
    const expiresAt = sellers?.expiry ? await sellers.expiry(entry.connect?.zone ?? name) : null;
    if (expiresAt) {
      fields.expiresAt = expiresAt;
      const due = expiryDue({ ...entry, expiresAt }, now());
      if (due && email && row.ownerEmail) {
        await email.sendPlatform({
          kind: DOMAIN_EXPIRING_EMAIL, to: row.ownerEmail, shopId, idempotencyKey: `${DOMAIN_EXPIRING_EMAIL}-${shopId}-${name}-${expiresAt}-${due.before}`,
          data: { pressName: row.pressName || shopId, domain: name, daysLeft: due.daysLeft, on: expiresAt, own: ownAddress(row), seller: entry.connect?.seller ?? null,
            date: new Date(expiresAt).toLocaleDateString("en-CA", { dateStyle: "long", timeZone: "America/Toronto" }) },
        });
        fields.expiryWarned = { for: expiresAt, sent: { ...due.sent, [due.before]: iso() } };
        await logChange(shopId, `domain-expiring-${name}-${expiresAt}-${due.before}`, { kind: "domains.expiring", domain: name, expiresAt, before: due.before });
      }
    }
    await saveEntry(shopId, name, fields);
    return { ...found, expiresAt: fields.expiresAt ?? entry.expiresAt ?? null };
  }

  /** The sweep every few minutes: addresses not live yet, lines still waiting, the one email once live, the daily watch. */
  async function checkAll() {
    const results = [];
    for (const row of await registry.listShops()) {
      if (!row?.shopId || row.status === "abandoned") continue;
      for (const d of domainsOf(row)) {
        const waiting = d.state !== "live" || (email && (d.connect || (d.free && !d.former)) && !d.liveEmailedAt) || EXTRA_PURPOSES.some((p) => d.extraRecords?.[p] && !d.extraRecords[p].appliedAt);
        const watchDue = !waiting && !(now() - Date.parse(d.watchedAt ?? "") < WATCH_EVERY_MS);
        if (!waiting && !watchDue) continue;
        try {
          const found = watchDue ? await watch(row.shopId, d.name) : await check(row.shopId, d.name);
          results.push({ shopId: row.shopId, domain: d.name, state: found.state });
        } catch (err) {
          results.push({ shopId: row.shopId, domain: d.name, state: "failed", detail: err?.message || String(err) });
        }
      }
    }
    return results;
  }

  const OPS = {
    "domains.list": (shopId) => list(shopId),
    "domains.add": (shopId, args) => add(shopId, args.domain),
    "domains.check": (shopId, args) => check(shopId, args.domain),
    "domains.makeMain": (shopId, args) => makeMain(shopId, args.domain),
    "domains.remove": (shopId, args) => remove(shopId, args.domain),
    // From the shop's own admin: the press chooses main itself, but www comes along, as in setup.
    "domains.connect": (shopId, args) => connect(shopId, args.domain, { www: args.www !== false }),
    // A new name for the shop's free address (Settings › General); the one before keeps working.
    "domains.renameFree": (shopId, args) => renameFreeAddress(shopId, args.name),
  };

  return {
    list,
    connectFreeAddress,
    renameFreeAddress,
    add,
    check,
    makeMain,
    remove,
    connect,
    applyRecords,
    removeRecords,
    removeDomain,
    allowed,
    checkAll,

    /** The seller's window sends the press back here: `GET /allowed?shop=&domain=&state=` (and `error=` on No). */
    async allowedCall(query = {}) {
      try {
        const back = await allowed({ shop: query.shop, domain: query.domain, state: query.state, error: query.error });
        if (!back) return { status: 404, body: { error: "There's no shop here." } };
        return { status: 302, headers: { Location: back }, body: "" };
      } catch (err) {
        console.error("Domain Allow answer error:", err);
        return { status: 502, body: { error: "Something went wrong. Go back to your shop's settings and press Check again." } };
      }
    },

    /** The shop's door: `X-Shop-Id` + `Authorization: Bearer <service key>`, body { op, args }. */
    async shopCall({ headers, body } = {}) {
      try {
        const get = (name) => {
          const found = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name);
          return typeof found?.[1] === "string" ? found[1] : "";
        };
        const shopId = get("x-shop-id");
        const row = shopId ? await registry.getShop(shopId) : null;
        // One answer for "no such shop" and "wrong key", so the door can't be used to find shop ids.
        if (!row || !serviceKeyMatches(get("authorization").replace(/^Bearer\s+/i, ""), row.serviceKeyHash)) {
          throw new DomainError(401, "unknown_shop", "This shop can't use the platform's domains.");
        }
        if (row.status === "abandoned") throw new DomainError(403, "shop_closed", "This shop is closed.");
        const op = body && typeof body === "object" && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
        if (!op) throw new DomainError(400, "bad_request", "Unknown call.");
        const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
        return { status: 200, body: await op(shopId, args) };
      } catch (err) {
        if (err instanceof DomainError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
        console.error("Domain service error:", err);
        return { status: 502, body: { error: { code: "google_error", message: "Google didn't answer about this address. Try again in a minute." } } };
      }
    },
  };
}
