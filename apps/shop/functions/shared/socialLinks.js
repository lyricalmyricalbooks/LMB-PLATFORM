// GENERATED from src/shared/socialLinks.ts by scripts/build-shared.mjs. Do not edit: change the .ts and run the script.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socialNetwork = exports.SOCIAL_KEYS = exports.SOCIAL_NETWORKS = void 0;
exports.readSocialInput = readSocialInput;
exports.socialShortAddress = socialShortAddress;
exports.savedSocialAccounts = savedSocialAccounts;
exports.orderedNetworks = orderedNetworks;
exports.moveSocial = moveSocial;
exports.shopSocialAccounts = shopSocialAccounts;
const PLACEHOLDER_INSTAGRAM = "https://www.instagram.com/yourpress";
const at = (h) => h.replace(/^@+/, "");
exports.SOCIAL_NETWORKS = [
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
exports.SOCIAL_KEYS = exports.SOCIAL_NETWORKS.map((n) => n.key);
const socialNetwork = (key) => exports.SOCIAL_NETWORKS.find((n) => n.key === key);
exports.socialNetwork = socialNetwork;
const HANDLE = /^[A-Za-z0-9._-]{1,80}$/;
const MASTODON = /^@?([A-Za-z0-9_.-]{1,64})@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)$/;
function hostOk(n, host) {
    if (!n.hosts.length)
        return true;
    const h = host.toLowerCase().replace(/^www\./, "");
    return n.hosts.some((ok) => h === ok || h.endsWith(`.${ok}`));
}
function asUrl(text) {
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, "")}`;
    try {
        const u = new URL(withScheme);
        return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u : null;
    }
    catch {
        return null;
    }
}
/**
 * What the owner typed (a link, `@name` or `name`) as the profile's full address, or a plain reason it can't be one.
 * Blank stays blank. A link to another site is refused so a Facebook link can't sit behind the Instagram icon.
 */
function readSocialInput(key, input) {
    const n = (0, exports.socialNetwork)(key);
    const text = String(input ?? "").trim();
    if (!n || !text)
        return { url: "" };
    if (n.key === "mastodon") {
        const m = text.match(MASTODON);
        if (m)
            return { url: `https://${m[2].toLowerCase()}/@${m[1]}` };
    }
    const looksLikeLink = /^https?:\/\//i.test(text) || text.includes("/");
    if (!looksLikeLink && n.profile && HANDLE.test(at(text)))
        return { url: n.profile(text) };
    const u = looksLikeLink ? asUrl(text) : null;
    if (!u) {
        return { url: "", problem: n.key === "mastodon" ? "Type it as @name@server, or paste your profile link." : n.profile ? `Type your ${n.name} name, or paste the link to your page.` : `Paste the link to your ${n.name} page.` };
    }
    if (!hostOk(n, u.hostname))
        return { url: "", problem: `That link isn't your ${n.name} page.` };
    u.protocol = "https:";
    return { url: u.toString() };
}
/** The address as a short line for the admin ("instagram.com/yourshop"). */
function socialShortAddress(url) {
    return String(url || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
}
/** The accounts the shop saved: Settings' own copy once it exists, else the older Studio links. */
function savedSocialAccounts(settings) {
    const own = settings?.social;
    const raw = own && typeof own === "object" && !Array.isArray(own) ? own : settings?.design?.social;
    return raw && typeof raw === "object" ? raw : {};
}
/**
 * The owner's order for the icons (Settings › Social media's arrows), saved as `settings/website.socialOrder`
 * because Firestore keeps a map's keys sorted. Networks it doesn't name follow in the networks' own order.
 */
function orderedNetworks(order) {
    const wanted = Array.isArray(order) ? order.map(String) : [];
    const rank = (k) => { const i = wanted.indexOf(k); return i < 0 ? wanted.length + exports.SOCIAL_KEYS.indexOf(k) : i; };
    return [...exports.SOCIAL_NETWORKS].sort((a, b) => rank(a.key) - rank(b.key));
}
/** One step up (-1) or down (+1) for `key` among the filled accounts, as the full order to save. */
function moveSocial(order, filled, key, step) {
    const keys = orderedNetworks(order).map((n) => n.key).filter((k) => filled.includes(k));
    const i = keys.indexOf(key);
    const j = i + step;
    if (i < 0 || j < 0 || j >= keys.length)
        return keys;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    return keys;
}
/** Every account that has a usable address, in the owner's order: what the website and emails show. */
function shopSocialAccounts(settings) {
    const saved = savedSocialAccounts(settings);
    const out = [];
    for (const n of orderedNetworks(settings?.socialOrder)) {
        const value = String(saved[n.key] ?? "").trim();
        if (!value || value === PLACEHOLDER_INSTAGRAM)
            continue;
        const { url } = readSocialInput(n.key, value);
        if (url)
            out.push({ key: n.key, name: n.name, url });
    }
    return out;
}
