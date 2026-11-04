// Every shop's free address on the platform's own shop domain (like a big shop builder's yourshop.<its domain>): the
// press's name, cleaned, under SHOP_ADDRESS_DOMAIN, so a new shop opens at moth-press.<shop domain> instead of a
// made-up Google name with five random letters. A name another shop has gets the next number (moth-press-2).
//
// The shop domain is a domain of its own, never the platform's or one under it, so a shop's pages can't read the
// platform's sign-in (each shop is a stranger to the platform, as on the big builders). Its lines live in the platform's
// own zone (platformZone.js), so connecting one needs no press at all. Unset, every shop keeps its web.app address.
import { slugFromPressName } from "../../signup/form.js";
import { normalDomain } from "./names.js";

const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
/** How many numbered names are tried before giving up (moth-press-2 … moth-press-99). */
export const MAX_NUMBER = 99;

/**
 * SHOP_ADDRESS_DOMAIN and the Cloud DNS zone that holds it (SHOP_ADDRESS_ZONE, SHOP_ADDRESS_ZONE_PROJECT), or null when
 * unset. Throws on a shop domain that is the platform's or under it.
 */
export function readFreeAddressConfig(env = {}, { platformDomain = "" } = {}) {
  const domain = normalDomain(String(env.SHOP_ADDRESS_DOMAIN ?? ""));
  const zone = String(env.SHOP_ADDRESS_ZONE ?? "").trim();
  const project = String(env.SHOP_ADDRESS_ZONE_PROJECT ?? "").trim();
  if (!domain && !zone && !project) return null;
  if (!domain || !zone || !project) throw new Error("SHOP_ADDRESS_DOMAIN, SHOP_ADDRESS_ZONE and SHOP_ADDRESS_ZONE_PROJECT go together");
  if (!DOMAIN.test(domain)) throw new Error("SHOP_ADDRESS_DOMAIN must be a domain like shops.example");
  const platform = normalDomain(platformDomain);
  if (platform && (domain === platform || domain.endsWith(`.${platform}`) || platform.endsWith(`.${domain}`))) {
    throw new Error("SHOP_ADDRESS_DOMAIN must be a domain of its own, not the platform's domain or one under it");
  }
  return { domain, zone, project };
}

/** The part before the shop domain for a press's name: "Moth Press & Co." -> "moth-press-and-co". */
export const shopHandle = (pressName) => slugFromPressName(pressName);

/** The names to try, in order: moth-press, moth-press-2, moth-press-3 … */
export function handleCandidates(pressName) {
  const base = shopHandle(pressName);
  return [base, ...Array.from({ length: MAX_NUMBER - 1 }, (_, i) => `${base}-${i + 2}`)];
}

/** The free address a press would get if nobody else had its name, for setup's preview. "" when there's no shop domain. */
export const freeAddressPreview = (pressName, shopDomain) => (shopDomain && pressName ? `${shopHandle(pressName)}.${shopDomain}` : "");

/**
 * The first free address not taken: `taken(name)` says whether a shop (or a press's own domain) already has it.
 * Null when all are taken.
 */
export async function pickFreeAddress(pressName, shopDomain, taken) {
  for (const handle of handleCandidates(pressName)) {
    const name = `${handle}.${shopDomain}`;
    if (!(await taken(name))) return name;
  }
  return null;
}
