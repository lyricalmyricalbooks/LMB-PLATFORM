import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { adminApi } from "./api";
import { unitPrice } from "../features/site/merchantFeed.mjs";
import {
  Checkbox, Dialog, EmptyState, ErrorState, GhostButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SectionCard, SelectField,
  StatusBadge, Tabs, TextArea, Toggle, useConfirm,
} from "./riso/components";
import {
  CHANNELS, PLACE_WORDS, POST_FILTERS, fromLocalInput, inFilter, localInputValue, maybeNotJpeg, postPhotos, postState, postablePlaces, socialError,
  starterCaption, whenText, type PostFilter, type SocialPost, type SocialStatus,
} from "./socialChannels";

type Props = {
  /** Opens another admin page ("channels"). */
  onOpen: (page: string) => void;
  /** A product to start a post with (Books › a book › Post to social). */
  startWithBook?: string | null;
  onStarted?: () => void;
};

const CAPTION_MAX = 2200;

/**
 * Social posts (code plan 27.6), like Shopify's Marketing posts: post one product to the connected Facebook Pages,
 * Instagram accounts, Pinterest boards and TikTok, now or at a time, and see what went out, what is waiting and what
 * needs another try. The server keeps the posts and sends scheduled ones every five minutes (functions/socialLink.js).
 */
export function SocialPosts({ onOpen, startWithBook = null, onStarted }: Props) {
  const [status, setStatus] = useState<SocialStatus | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PostFilter>("upcoming");
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
  const counts = useMemo(() => Object.fromEntries(POST_FILTERS.map((f) => [f.id, (posts || []).filter((p) => inFilter(p, f.id)).length])), [posts]);
  const shown = (posts || []).filter((p) => inFilter(p, filter));

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

  return (
    <div className="rp-stack" data-testid="social-posts">
      <PageActions><PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setComposing(null)}>Create post</PrimaryButton></PageActions>
      {notice && (
        <div role={notice.tone === "danger" ? "alert" : "status"} className="rp-alert" data-tone={notice.tone === "success" ? undefined : notice.tone}>
          <span className="rp-alert-glyph" aria-hidden="true">{notice.tone === "success" ? "✓" : "!"}</span>
          <div className="rp-alert-text"><span className="rp-alert-detail">{notice.text}</span></div>
        </div>
      )}
      <SectionCard collapsible={false} flush>
        <div className="rp-card-body" style={{ paddingBottom: 0 }}>
          <Tabs label="Posts" value={filter} onChange={setFilter}
            tabs={POST_FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] || undefined }))} />
        </div>
        {shown.length === 0 ? (
          <EmptyState inline title={filter === "upcoming" ? "Nothing scheduled" : filter === "posted" ? "Nothing posted yet" : "Nothing needs you"}
            description={filter === "upcoming" ? "Create a post to share a product." : undefined} />
        ) : (
          <ul className="rp-list" aria-label="Posts">
            {shown.map((post) => {
              const badge = postState(post);
              return (
                <li key={post.id} className="rp-post-row">
                  <img className="rp-post-thumb" src={post.imageUrl} alt="" loading="lazy" />
                  <div className="rp-post-main">
                    <div className="rp-row-meta">
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                      <span>{post.status === "scheduled" ? `Goes out ${whenText(post.sendAt)}` : whenText(post.sendAt)}</span>
                    </div>
                    <strong className="rp-post-title">{post.bookTitle}</strong>
                    <p className="rp-post-caption">{post.caption}</p>
                    <ul className="rp-post-places">
                      {post.places.map((p) => {
                        const r = post.results?.[p.id];
                        return (
                          <li key={p.id}>
                            <span>{PLACE_WORDS[p.kind]}: {p.name}</span>
                            {r?.state === "posted" && <span className="rp-hint"> ✓{r.tagged ? " product tagged" : ""}{r.privateOnly ? " (private for now)" : ""}</span>}
                            {r?.state === "failed" && <span className="rp-post-failed"> {r.message}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <div className="rp-post-actions">
                    {post.status === "scheduled" && <GhostButton size="sm" disabled={busy === post.id} onClick={() => cancel(post)}>Cancel</GhostButton>}
                    {(post.status === "failed" || post.status === "partly") && <SecondaryButton size="sm" disabled={busy === post.id} onClick={() => retry(post)}>{busy === post.id ? "Posting…" : "Try again"}</SecondaryButton>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      {composing !== false && (
        <Composer places={places} bookId={composing} onClose={() => setComposing(false)}
          onDone={(post) => {
            setComposing(false);
            setFilter(post.status === "scheduled" ? "upcoming" : post.status === "posted" ? "posted" : "attention");
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
      const { post } = await adminApi.social("savePost", { bookId: book.id, imageUrl: photo, caption, placeIds: where, sendAt, tagProduct: tag });
      if (post) onDone(post);
    } catch (err) { setError(socialError(err, later ? "schedule the post" : "post")); } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg" title="Create post"
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
          {toInstagram && photo && maybeNotJpeg(photo) && (
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
          <div className="rp-composer-card">
            {photo ? <img src={photo} alt="" /> : <div className="rp-composer-blank">Choose a product</div>}
            <p>{caption || "Your words show here."}</p>
            {book && <span className="rp-hint">Links to {book.title}</span>}
          </div>
        </aside>
      </div>
    </Dialog>
  );
}
