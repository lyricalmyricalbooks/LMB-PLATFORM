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

/** The longest name a press may pick (room is kept for "-99"). */
export const MAX_HANDLE = 30;
/** The name used when a press's own name can't be an address (rude, a big brand's, or one the platform keeps). */
export const FALLBACK_HANDLE = "my-shop";

// Names the platform keeps for itself, or that would look like it speaks for the platform.
const RESERVED = new Set([
  "www", "mail", "email", "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "ftp", "cdn", "static", "assets", "img",
  "api", "app", "apps", "admin", "administrator", "root", "system", "platform", "colophon", "help", "support", "status",
  "login", "signin", "sign-in", "signup", "sign-up", "account", "accounts", "billing", "pay", "payment", "payments",
  "checkout", "secure", "security", "verify", "password", "shop", "shops", "store", "stores", "test", "dev", "staging",
  "demo", "blog", "docs", "news", "official", "abuse", "postmaster", "webmaster", "hostmaster", "noreply", "no-reply",
]);
// Words a free address can't carry: big brands (an address under the platform's name must not pass as theirs) and
// rude words. Matched as whole words of the name, so "grassy-press" is fine and "amazon-books" is not.
const BLOCKED_WORDS = new Set([
  "amazon", "google", "gmail", "microsoft", "facebook", "instagram", "tiktok", "youtube", "netflix",
  "paypal", "stripe", "visa", "mastercard", "amex", "interac", "nike", "adidas", "disney", "walmart",
  "costco", "ebay", "etsy", "harpercollins", "scholastic", "canadapost", "fedex",
  "fuck", "fucking", "shit", "cunt", "bitch", "bastard", "dick", "cock", "pussy", "asshole", "nigger", "nigga",
  "faggot", "fag", "retard", "whore", "slut", "porn", "porno", "xxx", "sex", "nazi", "hitler", "kkk", "rape",
  "merde", "putain", "salope", "connard", "conne", "encule", "tabarnak", "calisse",
]);

/** A name a press typed, made into an address part: "Moth Press!" -> "moth-press". "" when nothing usable is left. */
export function cleanHandle(text) {
  return String(text ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, MAX_HANDLE).replace(/-+$/, "");
}

/** Why a name can't be a free address, in plain words, or "" when it can. */
export function handleProblem(handle) {
  const name = String(handle ?? "");
  if (name.length < 3) return "Use at least three letters or numbers.";
  if (name.length > MAX_HANDLE) return `Keep it to ${MAX_HANDLE} letters or fewer.`;
  if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(name) || name.includes("--")) return "Use letters, numbers and dashes, starting with a letter.";
  if (RESERVED.has(name)) return "That name is kept for the platform. Try another one.";
  if (name.split("-").some((word) => BLOCKED_WORDS.has(word))) return "That name can't be used for a shop address. Try another one.";
  return "";
}

/** The name to build on: the press's pick when it can be used, else its press name, else FALLBACK_HANDLE. */
export function baseHandle(pressName, { handle = "" } = {}) {
  const picked = cleanHandle(handle);
  if (picked && !handleProblem(picked)) return picked;
  const fromName = shopHandle(pressName);
  return handleProblem(fromName) ? FALLBACK_HANDLE : fromName;
}

/** The names to try, in order: moth-press, moth-press-2, moth-press-3 … */
export function handleCandidates(pressName, options = {}) {
  const base = baseHandle(pressName, options);
  return [base, ...Array.from({ length: MAX_NUMBER - 1 }, (_, i) => `${base}-${i + 2}`)];
}

/** The free address a press would get if nobody else had its name, for setup's preview. "" when there's no shop domain. */
export const freeAddressPreview = (pressName, shopDomain, handle = "") =>
  (shopDomain && (pressName || handle) ? `${baseHandle(pressName, { handle })}.${shopDomain}` : "");

/**
 * The first free address not taken: `taken(name)` says whether a shop (or a press's own domain) already has it.
 * `handle`: the name the press picked, used instead of its press name when it can be. Null when all are taken.
 */
export async function pickFreeAddress(pressName, shopDomain, taken, options = {}) {
  for (const handle of handleCandidates(pressName, options)) {
    const name = `${handle}.${shopDomain}`;
    if (!(await taken(name))) return name;
  }
  return null;
}

/** Setup statuses in which a press holds the free-address name it picked (signup/frontDoor.js freeNameHeld). */
export const HOLDING_STATUSES = Object.freeze(["setup", "opening"]);

/**
 * Whether another press, still in setup or opening its shop, picked `handle` (moth-books) for its free address, so
 * the name it was told is free stays its own. `presses.listByFreeName` (clients/platformStores.js, signup/fakes.js).
 */
export async function pickedByAnotherPress(presses, handle, exceptPressId = "") {
  if (!handle || typeof presses?.listByFreeName !== "function") return false;
  return (await presses.listByFreeName(handle)).some((p) => p?.pressId !== exceptPressId && HOLDING_STATUSES.includes(p?.status));
}

/**
 * Whether a shop in the registry already has `name` (as its free address or any of its addresses), for setup's check
 * while a press types a name. `registry.listShops()` (setup/fakes.js, clients/registry.js).
 */
export function freeAddressTaken(registry) {
  return async (name) => (await registry.listShops()).some((shop) => shop?.freeAddress === name
    || (Array.isArray(shop?.domains) && shop.domains.some((d) => d?.name === name)));
}
