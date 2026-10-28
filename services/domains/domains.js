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
//                                any lines still waiting) is checked, and the owner gets one email when it goes live
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
//   sellers    lookup(domain) -> { zone, registrar: { name } | null, domainConnect } (sellers.js); optional
//   publicLines has(record) -> boolean: the line shows from outside (sellers.js); optional
//   domainConnect  readDomainConnectConfig(env) (config.js), or null: every press gets the guide
//   email      sendPlatform({ kind, to, data, idempotencyKey, shopId }) (services/email); optional
import { randomBytes } from "node:crypto";
import { serviceKeyMatches } from "../email/http.js";
import { allowLink, fitTemplate, hostInZone, normalRecord, PURPOSES } from "./domainConnect.js";
import { guideFor, sellerName, zoneGuess } from "./sellers.js";
import { profileScript } from "../../profile/profile.js";
import { domainOrigins, domainProblem, mainAddress, MAX_DOMAINS, normalDomain, ownAddress, siteUrlOf, withExtraOrigins, withSiteUrl } from "./names.js";

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
const EXTRA_PURPOSES = PURPOSES.filter((p) => p !== "hosting");
const sameLines = (a = [], b = []) => JSON.stringify(a) === JSON.stringify(b);

export function createDomainService({
  registry, auditLog, hosting, envFiles, profileFiles, deploy, payments = null, platformDomain,
  sellers = null, publicLines = null, domainConnect = null, email = null,
  newState = () => randomBytes(12).toString("hex"), now = () => Date.now(),
}) {
  const iso = () => new Date(now()).toISOString();

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
      domains: domainsOf(row).map(({ name, state, addedAt, paymentDomainAt }) => ({ name, state: state ?? "connecting", addedAt, paymentDomainAt: paymentDomainAt ?? null, main: name === main })),
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
    if (state !== entry.state) {
      fields.state = state;
      if (state === "live") await logChange(shopId, `domain-live-${name}`, { kind: "domains.live", domain: name });
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
    if (Object.keys(fields).length) await saveEntry(shopId, name, fields);
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

  async function add(shopId, domain) {
    const name = normalDomain(domain);
    const problem = domainProblem(name, { platformDomain });
    if (problem) throw new DomainError(400, "bad_domain", problem);
    const row = await rowOf(shopId);
    if (name === `${projectOf(row)}.web.app` || name === `${projectOf(row)}.firebaseapp.com`) throw new DomainError(400, "bad_domain", "That is already your shop's own address.");
    const domains = domainsOf(row);
    if (!domains.some((d) => d.name === name)) {
      if (domains.length >= MAX_DOMAINS) throw new DomainError(409, "too_many", `A shop can have ${MAX_DOMAINS} addresses of its own.`);
      const holder = (await registry.listShops()).find((other) => other?.shopId !== shopId && domainsOf(other).some((d) => d.name === name));
      if (holder) throw new DomainError(409, "in_use", "That address is already connected to another shop.");
      await registry.updateShop(shopId, { domains: [...domains, { name, state: "connecting", addedAt: iso() }] });
      await logChange(shopId, `domain-added-${name}`, { kind: "domains.added", domain: name });
    }
    if (await syncServer(await rowOf(shopId))) {
      await logChange(shopId, `domain-origins-${name}`, { kind: "domains.server-allowed", domain: name });
    }
    await hosting.addDomain(projectOf(row), name);
    return check(shopId, name);
  }

  async function makeMain(shopId, domain) {
    const row = await rowOf(shopId);
    let name = normalDomain(domain ?? "");
    if (name === `${projectOf(row)}.firebaseapp.com`) name = ownAddress(row);
    let paymentDomain = null;
    if (name && name !== ownAddress(row)) {
      if (!domainsOf(row).some((d) => d.name === name)) throw new DomainError(404, "unknown_domain", "That address isn't connected to this shop.");
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
    if (mainAddress(row) === name) throw new DomainError(409, "is_main", "This is your shop's main address. Make another address main first, then remove this one.");
    await hosting.removeDomain(projectOf(row), name);
    await registry.updateShop(shopId, { domains: domainsOf(row).filter((d) => d.name !== name) });
    await logChange(shopId, `domain-removed-${name}-${iso()}`, { kind: "domains.removed", domain: name });
    await syncServer(await rowOf(shopId));
    return { removed: name, ...(await list(shopId)) };
  }

  /** The one step (plan 6.15): add, find the domain's seller, then the Allow link or the guide. */
  async function connect(shopId, domain) {
    const first = await add(shopId, domain);
    const name = first.name;
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
    const fields = { domains: domainsOf(row).filter((d) => d.name !== name) };
    if (normalDomain(row.mainDomain ?? "") === name) fields.mainDomain = null;
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

  /** The sweep every few minutes: addresses not live yet, lines still waiting, and the one email once live. */
  async function checkAll() {
    const results = [];
    for (const row of await registry.listShops()) {
      if (!row?.shopId || row.status === "abandoned") continue;
      for (const d of domainsOf(row)) {
        const waiting = d.state !== "live" || (email && d.connect && !d.liveEmailedAt) || EXTRA_PURPOSES.some((p) => d.extraRecords?.[p] && !d.extraRecords[p].appliedAt);
        if (!waiting) continue;
        try {
          const found = await check(row.shopId, d.name);
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
    "domains.connect": (shopId, args) => connect(shopId, args.domain),
  };

  return {
    list,
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
