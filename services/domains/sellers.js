// Where a press bought their domain (plan 6.15), and the plain-words guide for adding the lines by hand when that
// domain seller has no Allow window for Colophon. Press-facing words here never say what kind of technical line it
// is by its technical name: an "Address" line, a "Text" line, a "Mail" line or an "Alias" line, with a Copy button
// for each value on the card.
//
// The lookup is public: RDAP (the registries' own "who sold this domain" answer) finds the zone and the seller, and
// the zone's `_domainconnect` line names the seller's Domain Connect settings. Tests pass a pretend lookup (fakes.js).
import { hostInZone, normalRecord, relativeHost } from "./domainConnect.js";

/** Domain sellers with their own steps. `match` reads the seller's registered name. Never a rival shop platform. */
export const SELLERS = Object.freeze([
  { id: "godaddy", name: "GoDaddy", match: /godaddy/i, steps: ["Sign in at GoDaddy and open your Domain Portfolio.", "Choose {zone}, then open the tab that lists its lines (it shows a list with Type, Name and Value).", "For each line below, choose Add New Record, then copy across its kind, name and value, and save."] },
  { id: "namecheap", name: "Namecheap", match: /namecheap/i, steps: ["Sign in at Namecheap and open Domain List.", "Press Manage next to {zone}, then open the Advanced tab.", "For each line below, press Add New Record, then copy across its kind, name and value, and press the tick to save."] },
  { id: "cloudflare", name: "Cloudflare", match: /cloudflare/i, steps: ["Sign in at Cloudflare and choose {zone}.", "Open Records in the menu on the left.", "For each line below, press Add record, copy across its kind, name and value, and turn the orange cloud off so it shows grey. Then save."] },
  { id: "porkbun", name: "Porkbun", match: /porkbun/i, steps: ["Sign in at Porkbun and open Domain Management.", "Next to {zone}, open Details, then the edit button by the records list.", "For each line below, fill in its kind, name and value, and press Add."] },
  { id: "hover", name: "Hover", match: /hover|tucows/i, steps: ["Sign in at Hover and choose {zone}.", "Open the tab that lists its records.", "For each line below, press Add a record, copy across its kind, name and value, and save."] },
  { id: "gandi", name: "Gandi", match: /gandi/i, steps: ["Sign in at Gandi and open Domain, then choose {zone}.", "Open the Records tab.", "For each line below, press Add record, copy across its kind, name and value, and press Create."] },
  { id: "ionos", name: "IONOS", match: /ionos|1&1/i, steps: ["Sign in at IONOS and open Domains.", "Next to {zone}, open the gear menu and the page that lists its records.", "For each line below, press Add record, pick its kind, copy across its name and value, and save."] },
  { id: "namecom", name: "Name.com", match: /name\.com/i, steps: ["Sign in at Name.com and open My Domains.", "Choose {zone}, then Manage records.", "For each line below, fill in its kind, name and value, and press Add Record."] },
  { id: "dynadot", name: "Dynadot", match: /dynadot/i, steps: ["Sign in at Dynadot and open My Domains, then Manage Domains.", "Choose {zone} and open the records settings.", "For each line below, fill in its kind, name and value, and press Save."] },
]);

// Rival shop platforms also sell domains; their names never reach a press (CLAUDE.md), so they read as "your domain seller".
const RIVALS = /shopify|squarespace|wix|big ?cartel|etsy|woocommerce/i;
const GENERIC_STEPS = [
  "Sign in where you bought {zone} (your domain seller).",
  "Find the settings page that lists the lines for {zone}. It may be called Records, Zone or Advanced settings.",
  "For each line below, add a new line and copy across its kind, name and value, then save.",
];

/** The press-facing name of a seller from its registered name, or null ("your domain seller"). */
export function sellerName(registered) {
  const text = String(registered ?? "").trim();
  if (!text || RIVALS.test(text)) return null;
  const known = SELLERS.find((s) => s.match.test(text));
  if (known) return known.name;
  return text.replace(/,?\s+(inc|llc|ltd|limited|corp|corporation|gmbh|sas|s\.a\.|se|ag|bv|b\.v\.|pty)\.?$/i, "").trim() || null;
}

const KINDS = { A: "Address", AAAA: "Address", TXT: "Text", MX: "Mail", CNAME: "Alias" };

/**
 * The guide: steps for this seller, then one line per thing to add (and old lines to take out), with names as the
 * seller's form asks for them (relative to `zone`). `message` is the same in an email for the press's web person.
 */
export function guideFor({ seller = null, zone, domain, records = [] }) {
  const known = SELLERS.find((s) => s.name === seller);
  const steps = (known?.steps ?? GENERIC_STEPS).map((s) => s.replaceAll("{zone}", zone));
  steps.push("If a name is @, some sellers want that box left empty. Changes can take a few hours to reach everyone; we check every few minutes.");
  const lines = [];
  for (const raw of records) {
    const r = normalRecord(raw, domain);
    const kind = KINDS[r.type];
    if (!kind || !r.value) continue;
    const line = { action: r.action, kind, name: relativeHost(r.host, zone), value: r.value };
    if (r.priority !== undefined) line.priority = r.priority;
    if (!lines.some((l) => l.action === line.action && l.kind === line.kind && l.name === line.name && l.value === line.value)) lines.push(line);
  }
  const where = seller ?? "your domain seller";
  const describe = (l) => [
    l.action === "add" ? "Add a line" : "Remove the line, if it's there",
    `Kind: ${l.kind}`, `Name: ${l.name}`, `Value: ${l.value}`, ...(l.priority !== undefined ? [`Priority: ${l.priority}`] : []),
  ].join("\n");
  const message = {
    subject: `Please connect ${domain} to our shop`,
    body: [
      `Hello,\n\nCould you add these lines for ${zone} at ${where}? They open our shop at ${domain}.`,
      ...lines.map(describe),
      "Thank you!",
    ].join("\n\n"),
  };
  return { seller, zone, host: hostInZone(domain, zone), steps, lines, message };
}

/** The zone when nothing better is known: the last two parts of the address. */
export const zoneGuess = (domain) => String(domain).split(".").slice(-2).join(".");

/**
 * The public lookup: `lookup(domain) -> { zone, registrar: { name } | null, domainConnect }`, where `domainConnect`
 * is the seller's settings plus `hasTemplate` (Colophon's template is registered there) or null. Any failure reads as
 * "not known", so the press gets the generic guide rather than an error.
 */
export function sellerLookupClient({ fetch, resolveTxt, config = null, rdapBase = "https://rdap.org", timeoutMs = 8000 }) {
  const get = async (url) => {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      return response.ok ? await response.json().catch(() => null) : null;
    } catch { return null; }
  };
  const registrarOf = (rdap) => {
    for (const entity of rdap?.entities ?? []) {
      if (!entity?.roles?.includes("registrar")) continue;
      const fn = (entity.vcardArray?.[1] ?? []).find((field) => field?.[0] === "fn");
      if (typeof fn?.[3] === "string") return { name: fn[3] };
    }
    return null;
  };
  return {
    async lookup(domain) {
      const labels = String(domain).toLowerCase().split(".");
      let zone = null;
      let registrar = null;
      for (let i = 0; i < labels.length - 1 && !zone; i += 1) {
        const candidate = labels.slice(i).join(".");
        const rdap = await get(`${rdapBase}/domain/${encodeURIComponent(candidate)}`);
        if (rdap) { zone = candidate; registrar = registrarOf(rdap); }
      }
      zone ??= zoneGuess(domain);
      let domainConnect = null;
      try {
        const host = String((await resolveTxt(`_domainconnect.${zone}`))?.[0]?.join("") ?? "").trim();
        if (/^[a-z0-9.-]+(\/[\w./-]*)?$/i.test(host)) {
          const settings = await get(`https://${host.replace(/\/+$/, "")}/v2/${encodeURIComponent(zone)}/settings`);
          if (settings?.urlSyncUX) {
            let hasTemplate = false;
            if (config && settings.urlAPI) {
              hasTemplate = Boolean(await get(`${String(settings.urlAPI).replace(/\/+$/, "")}/v2/domainTemplates/providers/${encodeURIComponent(config.providerId)}/services/${encodeURIComponent(config.serviceId)}`));
            }
            domainConnect = { providerName: settings.providerDisplayName ?? settings.providerName ?? null, urlSyncUX: settings.urlSyncUX, width: settings.width ?? null, height: settings.height ?? null, hasTemplate };
          }
        }
      } catch { domainConnect = null; }
      return { zone, registrar, domainConnect };
    },
  };
}

/**
 * Public lines seen from outside (`has(record) -> boolean`), so lines a press typed by hand count as in. Node's
 * resolver; tests pass a pretend one.
 */
export function publicLinesClient({ resolver }) {
  const read = { TXT: async (h) => (await resolver.resolveTxt(h)).map((parts) => parts.join("")), MX: async (h) => (await resolver.resolveMx(h)).map((m) => m.exchange), A: (h) => resolver.resolve4(h), CNAME: (h) => resolver.resolveCname(h) };
  return {
    async has(record) {
      const reader = read[record.type];
      if (!reader) return false;
      try {
        const values = (await reader(record.host)).map((v) => String(v).toLowerCase().replace(/\.$/, ""));
        return values.includes(String(record.value).toLowerCase().replace(/\.$/, ""));
      } catch { return false; }
    },
  };
}
