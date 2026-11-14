import { PLACEHOLDER_INSTAGRAM } from "./constants";
import { SOCIAL_ICON_PATHS } from "./socialIconPaths";

// The shop's social media accounts (Settings › General › Social media), shown as small icons on the website
// (Studio › Style › Footer & social links decides where and how). Pure: the admin and the storefront share it.
// Saved as `settings/website.social` ({ instagram: "https://…", … }); shops that typed links into Studio before
// (14 November 2026) have them in `design.social`, read until the owner first saves Settings.

export type SocialKey =
  | "instagram" | "tiktok" | "facebook" | "youtube" | "pinterest" | "twitter"
  | "threads" | "bluesky" | "linkedin" | "substack" | "mastodon" | "goodreads";

export type SocialNetwork = {
  key: SocialKey;
  name: string;
  /** Sites a link for this network may point at (any subdomain counts). Empty = any site (Mastodon servers). */
  hosts: string[];
  /** The profile address for a bare @name, or null when only a link will do. */
  profile: ((handle: string) => string) | null;
  placeholder: string;
  /** Shown only to shops that sell books. */
  booksOnly?: boolean;
  /** Offered first in Settings; the rest sit behind "More". */
  popular?: boolean;
};

const at = (h: string) => h.replace(/^@+/, "");

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { key: "instagram", name: "Instagram", hosts: ["instagram.com", "instagr.am"], profile: (h) => `https://www.instagram.com/${at(h)}/`, placeholder: "@yourshop", popular: true },
  { key: "tiktok", name: "TikTok", hosts: ["tiktok.com"], profile: (h) => `https://www.tiktok.com/@${at(h)}`, placeholder: "@yourshop", popular: true },
  { key: "facebook", name: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], profile: (h) => `https://www.facebook.com/${at(h)}`, placeholder: "yourshop or a link", popular: true },
  { key: "youtube", name: "YouTube", hosts: ["youtube.com", "youtu.be"], profile: (h) => `https://www.youtube.com/@${at(h)}`, placeholder: "@yourshop", popular: true },
  { key: "pinterest", name: "Pinterest", hosts: ["pinterest.com", "pinterest.ca", "pinterest.co.uk", "pinterest.fr", "pinterest.de", "pinterest.com.au", "pin.it"], profile: (h) => `https://www.pinterest.com/${at(h)}/`, placeholder: "yourshop" },
  { key: "twitter", name: "X", hosts: ["x.com", "twitter.com"], profile: (h) => `https://x.com/${at(h)}`, placeholder: "@yourshop" },
  { key: "threads", name: "Threads", hosts: ["threads.net", "threads.com"], profile: (h) => `https://www.threads.com/@${at(h)}`, placeholder: "@yourshop" },
  { key: "bluesky", name: "Bluesky", hosts: ["bsky.app"], profile: (h) => `https://bsky.app/profile/${at(h).includes(".") ? at(h) : `${at(h)}.bsky.social`}`, placeholder: "yourshop.bsky.social" },
  { key: "linkedin", name: "LinkedIn", hosts: ["linkedin.com", "lnkd.in"], profile: (h) => `https://www.linkedin.com/company/${at(h)}`, placeholder: "Paste your page link" },
  { key: "substack", name: "Substack", hosts: ["substack.com"], profile: (h) => `https://${at(h).toLowerCase()}.substack.com`, placeholder: "yourshop" },
  { key: "mastodon", name: "Mastodon", hosts: [], profile: null, placeholder: "Paste your profile link" },
  { key: "goodreads", name: "Goodreads", hosts: ["goodreads.com"], profile: null, placeholder: "Paste your page link", booksOnly: true },
];

export const SOCIAL_KEYS = SOCIAL_NETWORKS.map((n) => n.key);
export const socialNetwork = (key: string) => SOCIAL_NETWORKS.find((n) => n.key === key);
export const socialIconPath = (key: string) => SOCIAL_ICON_PATHS[key] || "";

const HANDLE = /^[A-Za-z0-9._-]{1,80}$/;
const MASTODON = /^@?([A-Za-z0-9_.-]{1,64})@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;

function hostOk(n: SocialNetwork, host: string) {
  if (!n.hosts.length) return true;
  const h = host.toLowerCase().replace(/^www\./, "");
  return n.hosts.some((ok) => h === ok || h.endsWith(`.${ok}`));
}

function asUrl(text: string): URL | null {
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u : null;
  } catch {
    return null;
  }
}

/**
 * What the owner typed (a link, `@name` or `name`) as the profile's full address, or a plain reason it can't be one.
 * Blank stays blank. A link to another site is refused so a Facebook link can't sit behind the Instagram icon.
 */
export function readSocialInput(key: string, input: unknown): { url: string; problem?: string } {
  const n = socialNetwork(key);
  const text = String(input ?? "").trim();
  if (!n || !text) return { url: "" };
  if (n.key === "mastodon") {
    const m = text.match(MASTODON);
    if (m) return { url: `https://${m[2].toLowerCase()}/@${m[1]}` };
  }
  const looksLikeLink = /^https?:\/\//i.test(text) || text.includes("/");
  if (!looksLikeLink && n.profile && HANDLE.test(at(text))) return { url: n.profile(text) };
  const u = looksLikeLink ? asUrl(text) : null;
  if (!u) {
    return { url: "", problem: n.key === "mastodon" ? "Type it as @name@server, or paste your profile link." : n.profile ? `Type your ${n.name} name, or paste the link to your page.` : `Paste the link to your ${n.name} page.` };
  }
  if (!hostOk(n, u.hostname)) return { url: "", problem: `That link isn't your ${n.name} page.` };
  u.protocol = "https:";
  return { url: u.toString() };
}

/** The address as a short line for the admin ("instagram.com/yourshop"). */
export function socialShortAddress(url: string) {
  return String(url || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}

/** The accounts the shop saved: Settings' own copy once it exists, else the older Studio links. */
export function savedSocialAccounts(settings: any): Record<string, string> {
  const own = settings?.social;
  const raw = own && typeof own === "object" && !Array.isArray(own) ? own : settings?.design?.social;
  return raw && typeof raw === "object" ? raw : {};
}

export type SocialLink = { key: SocialKey; name: string; url: string; path: string };

/** Every account that has a usable address, in the networks' order: what the website draws as icons. */
export function shopSocialLinks(settings: any): SocialLink[] {
  const saved = savedSocialAccounts(settings);
  const out: SocialLink[] = [];
  for (const n of SOCIAL_NETWORKS) {
    const value = String(saved[n.key] ?? "").trim();
    if (!value || value === PLACEHOLDER_INSTAGRAM) continue;
    const { url } = readSocialInput(n.key, value);
    if (url) out.push({ key: n.key, name: n.name, url, path: socialIconPath(n.key) });
  }
  return out;
}
