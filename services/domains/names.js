// Web address rules shared by the domain service and the shop maker (setup step 8 writes the same origins).

export const MAX_DOMAINS = 3;

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
// Addresses a press can't take: Google's and Firebase's own, and made-up or local names.
const NOT_OURS = [/\.web\.app$/, /\.firebaseapp\.com$/, /\.googleapis\.com$/, /\.(local|localhost|internal|invalid|test)$/, /^localhost$/];

/** Lower case, no scheme, path or trailing dot; "" when it can't be an address. */
export function normalDomain(value) {
  if (typeof value !== "string") return "";
  let text = value.trim().toLowerCase();
  text = text.replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return text;
}

/** Why `name` can't be a shop's address, in plain words; null when it can. */
export function domainProblem(name, { platformDomain = "" } = {}) {
  if (!name) return "Type the address, like shop.yourpress.com.";
  if (name.length > 253) return "That address is too long.";
  if (NOT_OURS.some((pattern) => pattern.test(name))) return "That address can't be used. Use an address you own.";
  const labels = name.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label)) || /^[0-9]+$/.test(labels.at(-1))) {
    return "That doesn't look like a web address. Use letters, numbers and dashes, like shop.yourpress.com.";
  }
  const platform = normalDomain(platformDomain);
  if (platform && (name === platform || name.endsWith(`.${platform}`))) return "That address belongs to the platform. Use an address you own.";
  return null;
}

/** The https origins for a shop's addresses (registry `domains`), in a steady order. */
export function domainOrigins(domains) {
  const names = (Array.isArray(domains) ? domains : []).map((d) => normalDomain(typeof d === "string" ? d : d?.name)).filter(Boolean);
  return [...new Set(names)].sort().map((name) => `https://${name}`);
}

/** The env file with SHOP_EXTRA_ORIGINS set to `origins` (setup/later-steps.js envFileText writes the line). */
export function withExtraOrigins(text, origins) {
  const line = `SHOP_EXTRA_ORIGINS="${origins.join(",")}"`;
  if (/^SHOP_EXTRA_ORIGINS=.*$/m.test(text)) return text.replace(/^SHOP_EXTRA_ORIGINS=.*$/m, line);
  return `${text.replace(/\n?$/, "\n")}${line}\n`;
}

/** The address Firebase gives every shop (`<project id>.web.app`). It always works and is never removed. */
export function ownAddress(row) {
  return `${row?.projectId ?? row?.shopId}.web.app`;
}

/**
 * The shop's main address (plan 5.9): registry `mainDomain` when it is one of the shop's `domains`, else its own
 * web.app address. Emails, links, the sitemap and Apple Pay / Google Pay follow it (`SHOP_SITE_URL`, the profile's
 * `siteUrl`). Setup steps 6 and 8 write it from the registry, so running setup again keeps the press's choice.
 */
export function mainAddress(row) {
  const main = normalDomain(row?.mainDomain ?? "");
  const domains = Array.isArray(row?.domains) ? row.domains : [];
  return main && domains.some((d) => normalDomain(d?.name) === main) ? main : ownAddress(row);
}

/** `https://` + the main address: the shop's site address. */
export const siteUrlOf = (row) => `https://${mainAddress(row)}`;

/** The env file with SHOP_SITE_URL set to `url` (setup/later-steps.js envFileText writes the line). */
export function withSiteUrl(text, url) {
  const line = `SHOP_SITE_URL="${url}"`;
  if (/^SHOP_SITE_URL=.*$/m.test(text)) return text.replace(/^SHOP_SITE_URL=.*$/m, line);
  return `${text.replace(/\n?$/, "\n")}${line}\n`;
}
