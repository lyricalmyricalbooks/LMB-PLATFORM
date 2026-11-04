// Sales channels and Social posts (code plan 27.4-27.6): the shop's side of the platform's social service
// (LMB-PLATFORM services/social, PLATFORM_SOCIAL_URL). The platform holds the Meta, Pinterest and TikTok keys and the
// press's tokens and makes every post; this passes the admin's steps on, as this shop, with its service key, and keeps
// the shop's posts in `socialPosts` (server only: the rules let no browser read or write them). Admin-only.
//
//   body { action: "social", step, ... }
//     status                                  is it on; each network: connected, the account, its places, the catalog
//     connect { network, returnUrl }          the network's sign-in page
//     disconnect { network }
//     sendCatalog { network }                 the shop's product file (social-product-feed.csv) to the network's catalog
//     posts                                   the latest 100 posts, newest first
//     savePost { bookId, imageUrl, caption, placeIds, sendAt?, tagProduct? }
//                                             a post of one product: now (no sendAt) or at `sendAt`
//     cancelPost { id }                       a scheduled post that hasn't gone yet
//     retryPost { id }                        the places that failed, again, now
//
// `runDuePosts()` is the 5-minute sweep: each scheduled post whose time has come is claimed (one sweep at a time per
// post) and sent to each of its places; the platform remembers every post and place, so nothing goes out twice.
// Without PLATFORM_SOCIAL_URL the link is off: `status` answers { enabled: false } (Sales channels shows the by-hand
// steps) and every other platform step is refused.

const COLLECTION = "socialPosts";
const FEED_FILE = "social-product-feed.csv";
const SHOP_CURRENCY = "CAD";
const CAPTION_MAX = 2200;
const MAX_PLACES = 10;
const CLAIM_STALE_MS = 15 * 60 * 1000;
const YEAR_MS = 366 * 24 * 60 * 60 * 1000;
const PLACE_ID = /^(fb|ig|pin|tt):[A-Za-z0-9_.-]{1,80}$/;
const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NETWORK_STEPS = Object.freeze({ status: "social.status", connect: "social.connectLink", disconnect: "social.disconnect", sendCatalog: "social.sendCatalog" });
const STEPS = Object.freeze([...Object.keys(NETWORK_STEPS), "posts", "savePost", "cancelPost", "retryPost"]);
/** Where a visit from each place came from, on the product link (the Overview's visit sources read utm_source). */
const SOURCE = Object.freeze({ fb: "facebook", ig: "instagram", pin: "pinterest", tt: "tiktok" });

class StepError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (message) => new StepError(400, "bad_request", message);

/** The photos a post may use: the product's own, never any other address. */
function bookPhotos(book) {
  const urls = [];
  for (const p of Array.isArray(book.photos) ? book.photos : []) if (typeof p?.url === "string" && p.type !== "video") urls.push(p.url);
  if (typeof book.photoUrl === "string") urls.push(book.photoUrl);
  for (const v of Array.isArray(book.variants) ? book.variants : []) if (typeof v?.photoUrl === "string") urls.push(v.photoUrl);
  return [...new Set(urls.filter((u) => /^https:\/\//.test(u)))];
}

/** The product's id in the shop's product file (merchantFeed.mjs): its first edition's, or its own. */
function retailerIdOf(book) {
  const variants = Array.isArray(book.variants) ? book.variants.filter((v) => v && v.id) : [];
  return variants.length ? `${book.id}_${variants[0].id}`.slice(0, 50) : String(book.id).slice(0, 50);
}

function productLink(siteUrl, book, placeId) {
  const url = new URL(`${siteUrl.replace(/\/+$/, "")}/books/${encodeURIComponent(book.slug)}`);
  url.searchParams.set("utm_source", SOURCE[placeId.split(":")[0]] || "social");
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", "shop-post");
  return url.toString();
}

/** What a post's places came to: every place posted, some, or none. */
function overall(results, places) {
  const states = places.map((p) => results[p.id]?.state);
  if (states.every((s) => s === "posted")) return "posted";
  if (states.some((s) => s === "posted")) return "partly";
  return "failed";
}

function socialActions({ url, shopId, serviceKey, requireAdmin, db, siteUrl, fetch = globalThis.fetch, now = () => Date.now(), timeoutMs = 30000, randomId = null }) {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const posts = () => db.collection(COLLECTION);

  async function platform(op, args) {
    const key = typeof serviceKey === "function" ? serviceKey() : "";
    if (!url) throw new StepError(409, "not_available", "Social channels aren't available for this shop.");
    if (!key) throw new StepError(503, "not_connected", "This shop isn't connected to the platform yet.");
    let response;
    try {
      response = await fetch(`${url}/shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ op, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.error("Social service unreachable:", err?.message || err);
      throw new StepError(502, "unreachable", "The platform didn't answer. Try again in a minute.");
    }
    let answer = null;
    try { answer = await response.json(); } catch { answer = null; }
    if (!response.ok) {
      const status = response.status >= 400 && response.status < 500 ? response.status : 502;
      throw new StepError(status, answer?.error?.code || "platform_error", answer?.error?.message || "The platform couldn't do that just now.");
    }
    return answer ?? {};
  }

  /** Sends one post to each place that hasn't had it, and saves what happened. */
  async function sendPost(ref, post, { only = null } = {}) {
    const book = (await db.collection("books").doc(post.bookId).get()).data?.() || null;
    const results = { ...(post.results || {}) };
    for (const place of post.places) {
      if (results[place.id]?.state === "posted") continue;
      if (only && !only.includes(place.id)) continue;
      if (!book || !book.slug) {
        results[place.id] = { state: "failed", at: iso(), message: "This product was deleted or has no page, so the post can't link to it." };
        continue;
      }
      try {
        const done = await platform("social.publish", {
          postId: ref.id, placeId: place.id, imageUrl: post.imageUrl, caption: post.caption,
          link: productLink(siteUrl, book, place.id), title: post.title, altText: post.title, retailerId: post.retailerId, tagProduct: post.tagProduct,
        });
        results[place.id] = done.state === "posted"
          ? { state: "posted", at: done.at || iso(), ...(done.tagged ? { tagged: true } : {}), ...(done.privateOnly ? { privateOnly: true } : {}) }
          : { state: "sending", at: iso() };
      } catch (err) {
        results[place.id] = { state: "failed", at: iso(), message: err instanceof StepError ? err.message : "Couldn't post just now." };
      }
    }
    const pending = post.places.some((p) => results[p.id]?.state === "sending");
    const status = pending ? "sending" : overall(results, post.places);
    await ref.update({ results, status, sentAt: iso(), updatedAt: iso(), claimedAt: pending ? iso() : null });
    return { ...post, id: ref.id, results, status };
  }

  async function readPlaces(placeIds) {
    if (!Array.isArray(placeIds) || !placeIds.length) throw bad("Choose where to post.");
    if (placeIds.length > MAX_PLACES || placeIds.some((id) => typeof id !== "string" || !PLACE_ID.test(id))) throw bad("Choose where to post.");
    const status = await platform("social.status", {});
    const known = new Map();
    for (const n of status.networks || []) if (n.connected) for (const p of n.places || []) known.set(p.id, { id: p.id, kind: p.kind, name: p.name, network: n.network });
    const places = [...new Set(placeIds)].map((id) => known.get(id));
    if (places.some((p) => !p)) throw new StepError(409, "no_place", "One of those places isn't connected any more. Check Sales channels.");
    return places;
  }

  async function savePost(body, admin) {
    const bookId = typeof body.bookId === "string" && DOC_ID.test(body.bookId) ? body.bookId : "";
    if (!bookId) throw bad("Choose a product.");
    const snap = await db.collection("books").doc(bookId).get();
    const book = snap.exists ? { id: bookId, ...snap.data() } : null;
    if (!book || !book.slug) throw bad("Choose a product that has its own page.");
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
    if (!bookPhotos(book).includes(imageUrl)) throw bad("Choose one of the product's photos.");
    const caption = typeof body.caption === "string" ? body.caption.trim() : "";
    if (!caption) throw bad("Write a few words for the post.");
    if (caption.length > CAPTION_MAX) throw bad(`Keep the words under ${CAPTION_MAX} letters (Instagram's limit).`);
    let sendAt = null;
    if (body.sendAt != null && body.sendAt !== "") {
      const at = Date.parse(String(body.sendAt));
      if (!Number.isFinite(at)) throw bad("Choose a date and time.");
      if (at < now() - 60 * 1000) throw bad("That time has passed. Choose a later one, or post now.");
      if (at > now() + YEAR_MS) throw bad("Choose a time within the next year.");
      sendAt = iso(at);
    }
    const places = await readPlaces(body.placeIds);
    const ref = randomId ? posts().doc(randomId()) : posts().doc();
    const post = {
      bookId, bookTitle: String(book.title || "").slice(0, 200), title: String(book.title || "").slice(0, 200),
      imageUrl, caption, places, retailerId: retailerIdOf(book), tagProduct: body.tagProduct !== false,
      sendAt: sendAt || iso(), status: sendAt ? "scheduled" : "sending", results: {},
      createdAt: iso(), createdBy: admin?.email || null, updatedAt: iso(), claimedAt: sendAt ? null : iso(),
    };
    await ref.set(post);
    if (sendAt) return { post: { id: ref.id, ...post } };
    return { post: await sendPost(ref, post) };
  }

  async function postRef(body) {
    const id = typeof body.id === "string" && DOC_ID.test(body.id) ? body.id : "";
    if (!id) throw bad("Which post?");
    const ref = posts().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new StepError(404, "not_found", "That post is gone.");
    return { ref, post: snap.data() };
  }

  async function cancelPost(body) {
    const { ref } = await postRef(body);
    // Only a post that hasn't started going out; the check and the change are one step.
    const cancelled = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.status !== "scheduled") return false;
      tx.update(ref, { status: "cancelled", updatedAt: iso() });
      return true;
    });
    if (!cancelled) throw new StepError(409, "already_sent", "That post has already gone out.");
    return { cancelled: true };
  }

  async function retryPost(body) {
    const { ref } = await postRef(body);
    const claimed = await claim(ref, ["failed", "partly"]);
    if (!claimed) throw new StepError(409, "busy", "That post is being sent right now.");
    return { post: await sendPost(ref, claimed) };
  }

  /** Takes a post for sending when its status is one of `from` (or its earlier claim went stale). */
  function claim(ref, from) {
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const post = snap.data();
      if (!post) return null;
      const stale = post.status === "sending" && (!post.claimedAt || Date.parse(post.claimedAt) < now() - CLAIM_STALE_MS);
      if (!from.includes(post.status) && !stale) return null;
      tx.update(ref, { status: "sending", claimedAt: iso(), updatedAt: iso() });
      return post;
    });
  }

  async function listPosts() {
    const snap = await posts().orderBy("createdAt", "desc").limit(100).get();
    return { posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }

  async function handleSocial(req, res) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const step = body.step;
    if (!STEPS.includes(step)) {
      res.status(400).json({ error: "Unknown step.", code: "bad_request" });
      return;
    }
    if (step === "status" && !url) { res.json({ enabled: false, networks: [] }); return; }
    try {
      if (step === "posts") { res.json(await listPosts()); return; }
      if (step === "savePost") { res.json(await savePost(body, admin)); return; }
      if (step === "cancelPost") { res.json(await cancelPost(body)); return; }
      if (step === "retryPost") { res.json(await retryPost(body)); return; }
      const network = typeof body.network === "string" ? body.network.slice(0, 20) : "";
      const args = step === "connect" ? { network, returnUrl: typeof body.returnUrl === "string" ? body.returnUrl.slice(0, 500) : "" }
        : step === "sendCatalog" ? { network, feedUrl: `${siteUrl.replace(/\/+$/, "")}/${FEED_FILE}`, currency: SHOP_CURRENCY }
          : step === "disconnect" ? { network } : {};
      res.json(await platform(NETWORK_STEPS[step], args));
    } catch (err) {
      if (err instanceof StepError) { res.status(err.status).json({ error: err.message, code: err.code }); return; }
      console.error("Social step failed:", err);
      res.status(500).json({ error: "Something went wrong. Try again in a minute.", code: "failed" });
    }
  }

  /** The 5-minute sweep: posts whose time has come, and posts whose sender stopped half-way. */
  async function runDuePosts({ limit = 20 } = {}) {
    if (!url) return { sent: 0 };
    const due = await posts().where("status", "==", "scheduled").where("sendAt", "<=", iso()).limit(limit).get();
    const stuck = await posts().where("status", "==", "sending").where("claimedAt", "<=", iso(now() - CLAIM_STALE_MS)).limit(limit).get();
    let sent = 0;
    for (const doc of [...due.docs, ...stuck.docs]) {
      const claimed = await claim(doc.ref, ["scheduled"]);
      if (!claimed) continue;
      await sendPost(doc.ref, claimed);
      sent++;
    }
    return { sent };
  }

  return { handleSocial, runDuePosts };
}

module.exports = { socialActions, productLink, retailerIdOf, bookPhotos, STEPS, FEED_FILE };
