// Which "colophon" domain names are already registered, by asking each name's registry over RDAP (the public
// successor to WHOIS). It only reads: it never registers, reserves or buys anything.
//
//   node waitlist/domain-check.js                 checks CANDIDATES
//   node waitlist/domain-check.js colophon.press  checks the names given
//
// IANA's bootstrap file says which registry answers for each ending (.com, .press…). A registry answering 200 means
// the name is registered; 404 means it is not registered, so it may be free to buy (a registrar still has the final
// word: some names are reserved or sold at a premium price). Anything else is "unknown": try again later.
// `fetch` is passed in, so the tests run with a fake and nothing in `npm test` reaches the network.
import { fileURLToPath } from "node:url";

export const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";

/** The names worth checking for the product name "Colophon" (docs/name-and-domain.md explains each). */
export const CANDIDATES = [
  "colophon.com",
  "colophon.app",
  "colophon.shop",
  "colophon.press",
  "colophon.ca",
  "colophon.co",
  "colophon.store",
  "colophon.studio",
  "getcolophon.com",
  "usecolophon.com",
  "colophonhq.com",
  "colophon.supply",
];

const NAME = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The RDAP base address for a domain's ending, from IANA's bootstrap file, or "" when none is listed. */
export function rdapBaseFor(bootstrap, domain) {
  const ending = domain.split(".").at(-1);
  for (const [endings, urls] of bootstrap?.services ?? []) {
    if (endings.includes(ending)) {
      const url = urls.find((u) => u.startsWith("https://")) ?? "";
      return url && !url.endsWith("/") ? `${url}/` : url;
    }
  }
  return "";
}

/**
 * Checks each name. Resolves to [{ domain, status, note }] where status is "registered", "not registered" or "unknown".
 * Never throws for one bad answer: that name is "unknown" and the rest are still checked.
 */
export async function checkDomains(names, { fetch }) {
  if (typeof fetch !== "function") throw new Error("checkDomains needs a fetch");
  const domains = names.map((n) => String(n).trim().toLowerCase());
  for (const d of domains) if (!NAME.test(d)) throw new Error(`"${d}" is not a domain name`);
  const answer = await fetch(BOOTSTRAP_URL, { headers: { Accept: "application/json" } });
  if (!answer.ok) throw new Error(`IANA's list of registries answered ${answer.status}`);
  const bootstrap = await answer.json();
  const results = [];
  for (const domain of domains) {
    const base = rdapBaseFor(bootstrap, domain);
    if (!base) {
      results.push({ domain, status: "unknown", note: "its registry has no RDAP service; ask a registrar" });
      continue;
    }
    try {
      const res = await fetch(`${base}domain/${domain}`, { headers: { Accept: "application/rdap+json" } });
      if (res.status === 200) results.push({ domain, status: "registered", note: "someone already holds it" });
      else if (res.status === 404) results.push({ domain, status: "not registered", note: "may be free; a registrar confirms the price" });
      else results.push({ domain, status: "unknown", note: `the registry answered ${res.status}` });
    } catch (error) {
      results.push({ domain, status: "unknown", note: `no answer (${error.message})` });
    }
  }
  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = process.argv.slice(2);
  const results = await checkDomains(names.length ? names : CANDIDATES, { fetch: globalThis.fetch });
  for (const { domain, status, note } of results) console.log(`${domain.padEnd(22)} ${status.padEnd(15)} ${note}`);
  console.log(`\nChecked ${new Date().toISOString().slice(0, 10)}. Nothing was registered or bought.`);
}
