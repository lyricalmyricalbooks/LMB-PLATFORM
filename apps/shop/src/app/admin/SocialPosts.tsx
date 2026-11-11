import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { unitPrice } from "../features/site/merchantFeed.mjs";
import {
  ActionMenu, Checkbox, Dialog, EmptyState, ErrorState, LoadingState, PageActions, PrimaryButton, SecondaryButton, SectionCard, SelectField,
  StatusBadge, TextArea, Toggle, useConfirm,
} from "./riso/components";
import {
  CHANNELS, PLACE_WORDS, fromLocalInput, inFilter, localInputValue, maybeNotJpeg, postPhotos, postState, postablePlaces, socialError,
  starterCaption, whenText, type SocialPost, type SocialStatus,
} from "./socialChannels";

type Props = {
  /** Opens another admin page ("channels"). */
  onOpen: (page: string) => void;
  /** A product to start a post with (Books › a book › Post to social). */
  startWithBook?: string | null;
  onStarted?: () => void;
};

const CAPTION_MAX = 2200;

/** A post's first line of words, cut short for the table. */
const firstLine = (caption: string) => { const line = String(caption || "").split("\n").find((l) => l.trim()) || ""; return line.length > 80 ? `${line.slice(0, 79)}…` : line; };

/**
 * Social posts (code plan 27.6), like Shopify's Marketing posts: post one product to the connected Facebook Pages,
 * Instagram accounts, Pinterest boards and TikTok, now or at a time, and see what went out, what is waiting and what
 * needs another try. The server keeps the posts and sends scheduled ones every five minutes (functions/socialLink.js).
 */
export function SocialPosts({ onOpen, startWithBook = null, onStarted }: Props) {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composing, setComposing] = useState<string | null | false>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [confirm, confirmNode] = useConfirm();

  const load = async () => {
    setLoadError(null);
    try {
      const s = await adminApi.social("status");
      setStatus(s);
      setPosts(s.enabled ? (await adminApi.social("posts")).posts || [] : []);
    } catch (err) { setLoadError(socialError(err, "load your posts")); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (startWithBook && status) { setComposing(startWithBook); onStarted?.(); }
  }, [startWithBook, status]);

  const places = postablePlaces(status);
  // Needs you, then scheduled (soonest first), then what went out (newest first).
  const rank = (p: SocialPost) => (inFilter(p, "attention") ? 0 : inFilter(p, "upcoming") ? 1 : 2);
  const rows = [...(posts || [])].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 1 ? Date.parse(a.sendAt) - Date.parse(b.sendAt) : Date.parse(b.sendAt) - Date.parse(a.sendAt)));

  const cancel = async (post: SocialPost) => {
    if (!await confirm({ title: "Cancel this post?", message: `It won't go out ${whenText(post.sendAt)}.`, confirmLabel: "Cancel post" })) return;
    setBusy(post.id);
    try { await adminApi.social("cancelPost", { id: post.id }); await load(); } catch (err) { setNotice({ tone: "danger", text: socialError(err, "cancel the post") }); } finally { setBusy(null); }
  };
  const retry = async (post: SocialPost) => {
    setBusy(post.id);
    try {
      const { post: done } = await adminApi.social("retryPost", { id: post.id });
      setNotice(done?.status === "posted" ? { tone: "success", text: "Posted." } : { tone: "warning", text: "Some places still didn't take it. The reason is under the post." });
      await load();
    } catch (err) { setNotice({ tone: "danger", text: socialError(err, "post again") }); } finally { setBusy(null); }
  };

  if (!status && !loadError) return <LoadingState label="Loading your posts…" />;
  if (loadError) return <ErrorState title="Posts didn't load" description={loadError} onRetry={load} />;

  if (!places.length) {
    return (
      <SectionCard collapsible={false}>
        <EmptyState
          title={status?.enabled ? "Connect an account to start posting" : "Posting is coming soon"}
          description={status?.enabled
            ? "Connect Facebook & Instagram, Pinterest or TikTok first."
            : "Post to Facebook, Instagram, Pinterest and TikTok from here, soon."}
          action={<PrimaryButton onClick={() => onOpen("channels")}>Open Sales channels</PrimaryButton>}
        />
      </SectionCard>
    );
  }

  // The mockup: New post by the title, then one table of every post (what, where, a chip, when), the ones that need
  // you first, then what is scheduled, then what went out. A place that refused says why under its name.
  return (
    <div className="rp-stack" data-testid="social-posts">
      <PageActions><PrimaryButton onClick={() => setComposing(null)}>New post</PrimaryButton></PageActions>
      {notice && (
        <div role={notice.tone === "danger" ? "alert" : "status"} className="rp-alert" data-tone={notice.tone === "success" ? undefined : notice.tone}>
          <span className="rp-alert-glyph" aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
          <div className="rp-alert-text"><span className="rp-alert-detail">{notice.text}</span></div>
        </div>
      )}
      {rows.length === 0 ? (
        <SectionCard collapsible={false}>
          <EmptyState title="No posts yet" description="Share a product with the accounts you connected, now or later."
            action={<PrimaryButton onClick={() => setComposing(null)}>New post</PrimaryButton>} />
        </SectionCard>
      ) : (
        <div className="rp-tablecard">
          <table aria-label="Posts">
            <thead><tr>
              <th scope="col">Post</th>
              <th scope="col" className="rp-tc-wide">Accounts</th>
              <th scope="col">Status</th>
              <th scope="col" className="rp-tc-end rp-tc-wide">When</th>
              <th scope="col"><span className="rp-sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((post) => {
                const badge = postState(post);
                const refused = post.places.filter((p) => post.results?.[p.id]?.state === "failed");
                const actions = [
                  ...(post.status === "scheduled" ? [{ label: "Cancel", onSelect: () => { if (!busy) void cancel(post); } }] : []),
                  ...(post.status === "failed" || post.status === "partly" ? [{ label: "Try again", onSelect: () => { if (!busy) void retry(post); } }] : []),
                ];
                return (
                  <tr key={post.id}>
                    <td>
                      {post.bookTitle}
                      <span className="rp-tc-sub">{firstLine(post.caption)}</span>
                    </td>
                    <td className="rp-tc-wide">
                      {[...new Set(post.places.map((p) => PLACE_WORDS[p.kind]))].join(", ")}
                      {refused.map((p) => <span key={p.id} className="rp-tc-sub" data-tone="danger">{post.results?.[p.id]?.message}</span>)}
                    </td>
                    <td><StatusBadge tone={badge.tone} glyph={false}>{busy === post.id ? "Working…" : badge.label}</StatusBadge></td>
                    <td className="rp-tc-end rp-tc-wide">{post.status === "scheduled" ? `Goes out ${whenText(post.sendAt)}` : whenText(post.sendAt)}</td>
                    <td className="rp-tc-end">{actions.length > 0 && <ActionMenu label={`Actions for the ${post.bookTitle} post`} actions={actions} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {composing !== false && (
        <Composer places={places} bookId={composing} onClose={() => setComposing(false)}
          onDone={(post) => {
            setComposing(false);
            setNotice(post.status === "scheduled" ? { tone: "success", text: `Scheduled for ${whenText(post.sendAt)}.` }
              : post.status === "posted" ? { tone: "success", text: "Posted." } : { tone: "warning", text: "Some places didn't take it. The reason is under the post." });
            load();
          }} />
      )}
      {confirmNode}
    </div>
  );
}

function Composer({ places, bookId, onClose, onDone }: {
  places: ReturnType<typeof postablePlaces>; bookId: string | null; onClose: () => void; onDone: (post: SocialPost) => void;
}) {
  const [books, setBooks] = useState<any[] | null>(null);
  const [chosen, setChosen] = useState<string>(bookId || "");
  const [photo, setPhoto] = useState("");
  const [caption, setCaption] = useState("");
  const [where, setWhere] = useState<string[]>(() => places.filter((p) => p.kind !== "pinterestBoard").map((p) => p.id).slice(0, 2));
  const [later, setLater] = useState(false);
  const [at, setAt] = useState(() => localInputValue(Date.now() + 60 * 60 * 1000));
  const [tag, setTag] = useState(true);
  const [square, setSquare] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getAllBooks({ includePrivate: false })
      .then((all) => setBooks(all.filter((b: any) => b.slug && b.productType !== "giftCard" && postPhotos(b).length).sort((a: any, b: any) => String(a.title).localeCompare(String(b.title)))))
      .catch(() => setBooks([]));
  }, []);

  const book = books?.find((b) => b.id === chosen) || null;
  const photos = postPhotos(book);
  useEffect(() => {
    if (!book) return;
    setPhoto(postPhotos(book)[0] || "");
    // Today's price, as the shop shows it (a sale price while the sale is on; the first edition's for editions).
    const first = Array.isArray(book.variants) ? book.variants.find((v: any) => v?.id) : null;
    setCaption(starterCaption({ ...book, price: unitPrice(book, first || null) }));
  }, [book?.id]);

  const toggle = (id: string) => setWhere((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  const toInstagram = places.some((p) => p.kind === "instagram" && where.includes(p.id));

  const save = async () => {
    setError(null);
    if (!book) return setError("Choose a product.");
    if (!caption.trim()) return setError("Write a few words for the post.");
    if (!where.length) return setError("Choose at least one place to post.");
    const sendAt = later ? fromLocalInput(at) : null;
    if (later && (!sendAt || Date.parse(sendAt) < Date.now())) return setError("Choose a time that hasn't passed yet.");
    setSaving(true);
    try {
      const { post } = await adminApi.social("savePost", { bookId: book.id, imageUrl: photo, caption, placeIds: where, sendAt, tagProduct: tag, square });
      if (post) onDone(post);
    } catch (err) { setError(socialError(err, later ? "schedule the post" : "post")); } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg" title="New post"
      footer={<>
        <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        <PrimaryButton disabled={saving || !book} onClick={save}>{saving ? (later ? "Scheduling…" : "Posting…") : later ? "Schedule post" : "Post now"}</PrimaryButton>
      </>}>
      <div className="rp-composer">
        <div className="rp-stack" style={{ gap: 16 }}>
          {books === null ? <LoadingState label="Loading your products…" /> : (
            <SelectField label="Product" value={chosen} onChange={(e) => setChosen(e.target.value)}>
              <option value="">Choose a product…</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </SelectField>
          )}
          {books && books.length === 0 && <p className="rp-hint" style={{ margin: 0 }}>Add a photo to a product to post it.</p>}

          {photos.length > 0 && (
            <fieldset className="rp-composer-photos">
              <legend>Photo</legend>
              {photos.map((url, i) => (
                <label key={url} data-picked={photo === url || undefined}>
                  <input type="radio" name="post-photo" checked={photo === url} onChange={() => setPhoto(url)} />
                  <img src={url} alt={`Photo ${i + 1}`} loading="lazy" />
                </label>
              ))}
            </fieldset>
          )}
          {photo && <Toggle label="Square picture (whole photo, fits every feed)" checked={square} onChange={setSquare} />}
          {!square && toInstagram && photo && maybeNotJpeg(photo) && (
            <p className="rp-hint" role="note" style={{ margin: 0 }}>Instagram may refuse this photo (JPEG only).</p>
          )}

          <TextArea label="Words" rows={6} value={caption} maxLength={CAPTION_MAX} onChange={(e) => setCaption(e.target.value)}
            hint={`${caption.length}/${CAPTION_MAX} · product link added for you`} />

          <fieldset className="rp-composer-where">
            <legend>Where to post</legend>
            {CHANNELS.map((c) => {
              const mine = places.filter((p) => p.network === c.id);
              if (!mine.length) return null;
              return (
                <div key={c.id} className="rp-stack" style={{ gap: 4 }}>
                  <span className="rp-hint">{c.name}</span>
                  {mine.map((p) => <Checkbox key={p.id} label={`${PLACE_WORDS[p.kind]}: ${p.name}`} checked={where.includes(p.id)} onChange={() => toggle(p.id)} />)}
                </div>
              );
            })}
          </fieldset>

          {toInstagram && <Toggle label="Tag the product on Instagram" checked={tag} onChange={setTag} />}

          <fieldset className="rp-composer-when">
            <legend>When</legend>
            <label><input type="radio" name="post-when" checked={!later} onChange={() => setLater(false)} /> Now</label>
            <label><input type="radio" name="post-when" checked={later} onChange={() => setLater(true)} /> At a time I pick</label>
            {later && (
              <label className="rp-composer-time">
                <span className="rp-hint">Date and time</span>
                <input type="datetime-local" value={at} min={localInputValue(Date.now())} onChange={(e) => setAt(e.target.value)} />
              </label>
            )}
          </fieldset>
          {error && <p role="alert" className="rp-post-failed" style={{ margin: 0 }}>{error}</p>}
        </div>

        <aside className="rp-composer-preview" aria-label="Preview">
          <span className="rp-hint">Preview</span>
          <div className="rp-composer-card" data-square={square}>
            {photo ? <img src={photo} alt="" /> : <div className="rp-composer-blank">Choose a product</div>}
            <p>{caption || "Your words show here."}</p>
            {book && <span className="rp-hint">Links to {book.title}</span>}
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
