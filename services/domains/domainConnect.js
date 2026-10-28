// Domain Connect (plan 6.15): the domain seller's own sign-in-and-Allow window adds the lines a press's domain needs,
// so the press never sees one. Colophon registers one template with each seller (a one-time step, Go-live plan); each
// Allow link names the template's groups it needs and fills in the template's variables, and is signed with
// Colophon's private key (config.js) so the seller knows the link came from Colophon.
//
// Spec: Domain Connect v2 (domainconnect.org), the synchronous flow:
//   {urlSyncUX}/v2/domainTemplates/providers/{providerId}/services/{serviceId}/apply
//     ?domain=<zone>&host=<part before it>&<variables>&groupId=<a,b>&redirect_uri=<..>&state=<..>&sig=<..>&key=<..>
// `sig` is the RSA-SHA256 signature of everything before `&sig=`, in Base64; `key` names the line under the provider id
// where the public key is published. The template's A line replaces the address lines already there (the spec's
// conflict rule), so lines Firebase Hosting wants removed need no group of their own.
import { createSign, createVerify } from "node:crypto";

/**
 * Colophon's template, by group. `host` is relative to the address being connected ("@" is the address itself);
 * `variable` fills the line's value. A purpose is the reason lines are added: the shop itself (hosting), sending email
 * from the press's domain (6.18), or Google's search tools (6.17).
 */
export const TEMPLATE_GROUPS = Object.freeze({
  hosting: [{ type: "A", host: "@", variable: "ip" }],
  "hosting-owner": [{ type: "TXT", host: "@", variable: "hostingsite", prefix: "hosting-site=" }],
  email: [
    { type: "MX", host: "send", variable: "emailmx", priority: 10 },
    { type: "TXT", host: "send", variable: "emailspf", prefix: "v=spf1" },
    { type: "TXT", host: "resend._domainkey", variable: "emaildkim" },
  ],
  google: [{ type: "TXT", host: "@", variable: "googletoken", prefix: "google-site-verification=" }],
});

/** The group sets each purpose may use, tried in order. */
const PURPOSE_GROUPS = { hosting: [["hosting"], ["hosting", "hosting-owner"]], email: [["email"]], google: [["google"]] };
export const PURPOSES = Object.freeze(Object.keys(PURPOSE_GROUPS));

const clean = (value) => String(value ?? "").trim().toLowerCase().replace(/\.$/, "");

/**
 * One line in one shape, whoever asked for it: Firebase Hosting's (`{ action, host, type, value }`, host in full),
 * Resend's (`{ name, type, value, priority }`, name relative to the domain) or Google's (`{ type, host, value }`).
 */
export function normalRecord(record, domain) {
  const base = clean(domain);
  let host = clean(record?.host ?? record?.name ?? "@");
  if (!host || host === "@") host = base;
  else if (host !== base && !host.endsWith(`.${base}`)) host = `${host}.${base}`;
  const out = { action: record?.action === "remove" ? "remove" : "add", type: String(record?.type ?? "").toUpperCase(), host, value: String(record?.value ?? record?.rdata ?? "") };
  if (record?.priority !== undefined && record?.priority !== null) out.priority = Number(record.priority);
  return out;
}

/** `host` as the part before `base` ("@" for `base` itself), the way domain sellers' forms ask for it. */
export function relativeHost(host, base) {
  const h = clean(host);
  const b = clean(base);
  if (h === b) return "@";
  return h.endsWith(`.${b}`) ? h.slice(0, -(b.length + 1)) : h;
}

/**
 * Which template groups add `records` to `domain`, and the variables that fill them; null when the lines don't fit
 * Colophon's template (the press gets the guide instead). Only lines to add count.
 */
export function fitTemplate(purpose, records, domain) {
  const adds = (records ?? []).map((r) => normalRecord(r, domain)).filter((r) => r.action === "add");
  if (!adds.length) return null;
  for (const groups of PURPOSE_GROUPS[purpose] ?? []) {
    const lines = groups.flatMap((g) => TEMPLATE_GROUPS[g]);
    if (lines.length !== adds.length) continue;
    const left = [...adds];
    const vars = {};
    let fits = true;
    for (const line of lines) {
      const i = left.findIndex((r) => r.type === line.type && relativeHost(r.host, domain) === line.host
        && (line.priority === undefined || r.priority === line.priority) && (!line.prefix || r.value.startsWith(line.prefix)));
      if (i < 0) { fits = false; break; }
      vars[line.variable] = left[i].value;
      left.splice(i, 1);
    }
    if (fits && !left.length) return { groups, vars };
  }
  return null;
}

/** The zone a seller holds (`mothpress.example`) and the part of the address before it (`shop`, or "" for the zone). */
export function hostInZone(domain, zone) {
  const rel = relativeHost(domain, zone);
  return rel === "@" ? "" : rel;
}

/**
 * The signed Allow link for the seller's window. `sync` is the seller's settings (`urlSyncUX`); `back` is added to the
 * address the seller sends the press back to (the shop and the address), and the seller adds `state` to it.
 */
export function allowLink({ config, sync, zone, host, groups, vars, state, back = {} }) {
  if (!/^https:\/\/[^\s]+$/.test(String(sync?.urlSyncUX ?? ""))) throw new Error("the domain seller has no https Allow address");
  const params = new URLSearchParams();
  params.set("domain", zone);
  if (host) params.set("host", host);
  for (const name of Object.keys(vars).sort()) params.set(name, vars[name]);
  params.set("groupId", groups.join(","));
  const backQuery = new URLSearchParams(back).toString();
  params.set("redirect_uri", backQuery ? `${config.redirectUrl}${config.redirectUrl.includes("?") ? "&" : "?"}${backQuery}` : config.redirectUrl);
  params.set("state", state);
  const query = params.toString();
  const sig = createSign("RSA-SHA256").update(query).sign(config.privateKey, "base64");
  const base = sync.urlSyncUX.replace(/\/+$/, "");
  const path = `/v2/domainTemplates/providers/${encodeURIComponent(config.providerId)}/services/${encodeURIComponent(config.serviceId)}/apply`;
  return `${base}${path}?${query}&sig=${encodeURIComponent(sig)}&key=${encodeURIComponent(config.keyHost)}`;
}

/** Whether `url`'s signature matches `publicKey`: what the seller checks (tests use it). */
export function linkSignatureValid(url, publicKey) {
  const [, query = ""] = String(url).split("?");
  const at = query.indexOf("&sig=");
  if (at < 0) return false;
  const signed = query.slice(0, at);
  const sig = new URLSearchParams(query.slice(at + 1)).get("sig") ?? "";
  return createVerify("RSA-SHA256").update(signed).verify(publicKey, sig, "base64");
}

/**
 * The template file Julian registers with each domain seller (Go-live plan): `node -e` it with the platform's settings,
 * or read it in a test. `syncRedirectDomain` is the host of DOMAIN_CONNECT_REDIRECT_URL.
 */
export function colophonTemplate({ providerId, serviceId = "shop", providerName = "Colophon", syncRedirectDomain, logoUrl }) {
  const records = [];
  for (const [groupId, lines] of Object.entries(TEMPLATE_GROUPS)) {
    for (const line of lines) {
      const record = { groupId, type: line.type, host: line.host, ttl: 3600 };
      if (line.type === "TXT") {
        record.data = `%${line.variable}%`;
        record.txtConflictMatchingMode = line.prefix ? "Prefix" : "All";
        if (line.prefix) record.txtConflictMatchingPrefix = line.prefix;
      } else {
        record.pointsTo = `%${line.variable}%`;
      }
      if (line.priority !== undefined) record.priority = line.priority;
      records.push(record);
    }
  }
  return {
    providerId, providerName, serviceId, serviceName: "Your shop on your own web address", version: 1,
    ...(logoUrl ? { logoUrl } : {}),
    description: "Opens your shop at this address, and lets your shop send email from it and show on Google.",
    variableDescription: "ip, hostingsite: the shop's hosting; emailmx, emailspf, emaildkim: email sending; googletoken: Google's ownership check",
    syncBlock: false, sharedProviderName: false, hostRequired: false,
    syncPubKeyDomain: providerId, syncRedirectDomain,
    records,
  };
}
