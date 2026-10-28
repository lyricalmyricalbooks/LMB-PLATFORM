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
//
// The order matters: the address may call the server code before Hosting serves the shop there, so shoppers never
// meet a shop whose checkout is refused. Every step is safe to repeat; each change is logged in the registry and the
// shop's audit log. Nothing here removes an address (a person does that for now).
//
// Clients passed in:
//   registry   getShop(shopId), updateShop(shopId, fields), listShops(), recordEvent(shopId, entry)
//   auditLog   write(shopId, id, entry)
//   hosting    getDomain(projectId, domain) -> CustomDomain | null; addDomain(projectId, domain) (clients/google.js)
//   envFiles   read(shopId) / write(shopId, text): the shop's saved server settings (setup step 8)
//   deploy     deployed(shopId, "functions") -> { version, region } | null; functions(shopId, { version, region, envFile })
//   payments   registerPaymentDomain(shopId, domain) (services/payments/service.js); optional
import { serviceKeyMatches } from "../email/http.js";
import { domainOrigins, domainProblem, MAX_DOMAINS, normalDomain, withExtraOrigins } from "./names.js";

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

export function createDomainService({ registry, auditLog, hosting, envFiles, deploy, payments = null, platformDomain, now = () => Date.now() }) {
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

  // The shop's server code must accept calls from every address the shop has (shopConfig.js allowedOrigins).
  async function allowOrigins(row) {
    const text = await envFiles.read(row.shopId);
    if (!text) return false; // setup step 8 writes it, with the registry's addresses
    const next = withExtraOrigins(text, domainOrigins(domainsOf(row)));
    if (next === text) return false;
    await envFiles.write(row.shopId, next);
    const live = await deploy.deployed(row.shopId, "functions");
    // Not deployed yet: the shop's first deploy ships the file as it is now.
    if (live?.version) await deploy.functions(row.shopId, { version: live.version, region: live.region ?? row.region, envFile: next });
    return true;
  }

  async function list(shopId) {
    const row = await rowOf(shopId);
    return { domains: domainsOf(row).map(({ name, state, addedAt, paymentDomainAt }) => ({ name, state: state ?? "connecting", addedAt, paymentDomainAt: paymentDomainAt ?? null })), max: MAX_DOMAINS };
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
    if (Object.keys(fields).length) await saveEntry(shopId, name, fields);
    return { name, state, records, paymentDomain };
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
    if (await allowOrigins(await rowOf(shopId))) {
      await logChange(shopId, `domain-origins-${name}`, { kind: "domains.server-allowed", domain: name });
    }
    await hosting.addDomain(projectOf(row), name);
    return check(shopId, name);
  }

  const OPS = {
    "domains.list": (shopId) => list(shopId),
    "domains.add": (shopId, args) => add(shopId, args.domain),
    "domains.check": (shopId, args) => check(shopId, args.domain),
  };

  return {
    list,
    add,
    check,

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
