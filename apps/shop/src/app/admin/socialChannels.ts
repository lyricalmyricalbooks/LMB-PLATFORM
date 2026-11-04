// Sales channels and Social posts (code plan 27.5, 27.6): the words and small rules both pages share. Pure and tested.
// The platform's social service (LMB-PLATFORM services/social) does the connecting and posting; see socialLink.js.

export type SocialNetwork = "meta" | "pinterest" | "tiktok";
export type PlaceKind = "facebookPage" | "instagram" | "pinterestBoard" | "tiktok";
export type SocialPlace = { id: string; kind: PlaceKind; name: string };
export type NetworkStatus = {
  network: SocialNetwork; name: string; available: boolean; connected: boolean; problem: "lost" | null;
  accountName: string | null; places: SocialPlace[]; catalog: { sentAt: string; feedUrl: string } | null; canSendCatalog: boolean;
};
export type SocialStatus = { enabled: boolean; networks: NetworkStatus[] };
export type PostState = "posted" | "failed" | "sending";
export type SocialPost = {
  id: string; bookId: string; bookTitle: string; imageUrl: string; caption: string; places: (SocialPlace & { network?: SocialNetwork })[];
  sendAt: string; status: "scheduled" | "sending" | "posted" | "partly" | "failed" | "cancelled";
  results?: Record<string, { state: PostState; at?: string; message?: string; tagged?: boolean; privateOnly?: boolean }>;
  createdAt: string;
};

/** The channels the page lists, in Shopify's order, with what each one does for the press. */
export const CHANNELS: { id: SocialNetwork; name: string; does: string }[] = [
  { id: "meta", name: "Facebook & Instagram", does: "Post products and tag them for shoppers." },
  { id: "pinterest", name: "Pinterest", does: "Pin products as shoppable pins." },
  { id: "tiktok", name: "TikTok", does: "Post product photos." },
];

export const PLACE_WORDS: Record<PlaceKind, string> = {
  facebookPage: "Facebook Page", instagram: "Instagram", pinterestBoard: "Pinterest board", tiktok: "TikTok",
};

/** Words for coming back from a network's sign-in page (`?social=…&network=…`). */
export function connectOutcome(outcome: string | null, network: string | null): { tone: "success" | "warning" | "danger"; text: string } | null {
  if (!outcome) return null;
  const name = CHANNELS.find((c) => c.id === network)?.name || "That account";
  if (outcome === "connected") return { tone: "success", text: `${name} is connected. You can post your products there now.` };
  if (outcome === "no_places") return { tone: "warning", text: network === "pinterest"
    ? "Pinterest is connected, but it has no boards yet. Make a board on Pinterest, then connect again."
    : `${name} is connected, but no Page was shared. Connect again and tick your Facebook Page (and its Instagram account).` };
  if (outcome === "denied") return { tone: "warning", text: `${name} wasn't connected, because the permission wasn't given. Press Connect to try again.` };
  return { tone: "danger", text: `${name} couldn't be connected just now. Try again in a few minutes.` };
}

/** A failure's words: what the server said when it is readable, otherwise a plain fallback. */
export function socialError(err: unknown, what: string): string {
  const e = (err ?? {}) as { message?: string };
  const said = typeof e.message === "string" && /[a-z]/.test(e.message) && !/^(Failed to fetch|NetworkError|Load failed|TypeError)/i.test(e.message) ? e.message : "";
  const reason = said || "Something went wrong. Try again in a moment.";
  return `Couldn't ${what}. ${/[.!?]$/.test(reason) ? reason : `${reason}.`}`;
}

/** Every place a post can go, from the connected accounts, in the channels' order. */
export function postablePlaces(status: SocialStatus | null): (SocialPlace & { network: SocialNetwork })[] {
  if (!status?.enabled) return [];
  return CHANNELS.flatMap((c) => {
    const n = status.networks.find((x) => x.network === c.id);
    return n?.connected ? n.places.map((p) => ({ ...p, network: c.id })) : [];
  });
}

/** The words a new post starts with: the product's name, a short line about it, the price and where to buy. */
export function starterCaption(book: { title?: string; subtitle?: string; price?: number | string; metaDescription?: string; description?: string }, shopName = ""): string {
  const title = String(book.title || "").trim();
  const plain = (s: unknown) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const about = plain(book.metaDescription) || plain(book.description);
  const short = about.length > 180 ? `${about.slice(0, 177).replace(/\s+\S*$/, "")}…` : about;
  const price = Number(book.price);
  const sub = plain(book.subtitle);
  const lines = [
    title + (sub ? (sub.startsWith("by ") ? ` ${sub}` : ` – ${sub}`) : ""),
    short,
    Number.isFinite(price) && price > 0 ? `$${price.toFixed(2)}${shopName ? ` at ${shopName}` : ""}. Link in the post.` : shopName ? `At ${shopName}. Link in the post.` : "",
  ].filter(Boolean);
  return lines.join("\n\n").slice(0, 2200);
}

/** The product's photos a post can use (never a video). */
export function postPhotos(book: { photos?: { url?: string; type?: string }[]; photoUrl?: string; variants?: { photoUrl?: string }[] } | null): string[] {
  if (!book) return [];
  const urls: string[] = [];
  for (const p of book.photos || []) if (p?.url && p.type !== "video") urls.push(p.url);
  if (book.photoUrl) urls.push(book.photoUrl);
  for (const v of book.variants || []) if (v?.photoUrl) urls.push(v.photoUrl);
  return [...new Set(urls.filter((u) => /^https:\/\//.test(u)))];
}

/** Instagram takes JPEG photos only; a photo whose address says it is another kind gets a gentle warning. */
export function maybeNotJpeg(url: string): boolean {
  let path = "";
  try { path = decodeURIComponent(new URL(url).pathname).toLowerCase(); } catch { path = ""; }
  return /\.(png|webp|gif|avif|heic)$/.test(path);
}

/** A "datetime-local" value on the press's own clock, and back to a moment. */
export function localInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): string | null {
  const ms = Date.parse(value);
  return value && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A post's badge in the list. */
export function postState(post: Pick<SocialPost, "status">): { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string } {
  switch (post.status) {
    case "posted": return { tone: "success", label: "Posted" };
    case "partly": return { tone: "warning", label: "Partly posted" };
    case "failed": return { tone: "danger", label: "Didn't post" };
    case "scheduled": return { tone: "info", label: "Scheduled" };
    case "cancelled": return { tone: "neutral", label: "Cancelled" };
    default: return { tone: "neutral", label: "Posting…" };
  }
}

export type PostFilter = "upcoming" | "posted" | "attention";
export const POST_FILTERS: { id: PostFilter; label: string }[] = [
  { id: "upcoming", label: "Scheduled" },
  { id: "posted", label: "Posted" },
  { id: "attention", label: "Needs attention" },
];
export function inFilter(post: Pick<SocialPost, "status">, filter: PostFilter): boolean {
  if (filter === "upcoming") return post.status === "scheduled" || post.status === "sending";
  if (filter === "posted") return post.status === "posted" || post.status === "cancelled";
  return post.status === "failed" || post.status === "partly";
}

export function whenText(iso: string | undefined): string {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
