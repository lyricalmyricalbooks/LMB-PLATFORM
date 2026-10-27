import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Copy, ImageUp, RefreshCw, Trash2 } from "lucide-react";
import { Dialog, PrimaryButton, SecondaryButton } from "../riso/components";
import { isMediaDenied, mediaApi } from "../mediaApi";
import { uploadErrorMessage, uploadMediaImage } from "./mediaUpload";
import {
  allPaths, applyMediaChange, budgetFor, collectStrings, filterMedia, formatBytes, isOverBudget, mainUrl, missingAlt,
  snapshotUses, sortMedia, storedDesignUses, thumbUrl, usagePaths, usagePlaces, type MediaFilter, type MediaItem, type UsagePlace,
} from "./mediaLibrary";
import type { MediaLibraryStatus, MediaPickerApi } from "./mediaPicker";

// Studio media library (2.4): the Media rail panel, the "Choose an image" picker and the hook that loads
// the admin-only `media/{id}` records. If those records can't be read yet (Firestore rules not deployed),
// both explain it and image fields keep taking a link or a plain upload, as before.

export function useMediaLibrary() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState<MediaLibraryStatus>("loading");
  const load = useCallback(async () => {
    setStatus("loading");
    try { setItems(sortMedia(await mediaApi.list())); setStatus("ready"); }
    catch (error) { setStatus(isMediaDenied(error) ? "denied" : "error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = useCallback(async (file: File, previous?: MediaItem) => {
    try {
      const item = await uploadMediaImage(file, previous);
      setItems(list => sortMedia([item, ...list.filter(i => i.id !== item.id)]));
      return item;
    } catch (error) {
      if (isMediaDenied(error)) setStatus("denied");
      throw error;
    }
  }, []);
  const save = useCallback(async (item: MediaItem) => {
    await mediaApi.save(item);
    setItems(list => list.map(i => (i.id === item.id ? item : i)));
  }, []);
  const remove = useCallback(async (item: MediaItem) => {
    const leftOver = (await mediaApi.remove(item, allPaths(item))) || [];
    setItems(list => list.filter(i => i.id !== item.id));
    return leftOver;
  }, []);

  const [picking, setPicking] = useState<null | { title: string; resolve: (item: MediaItem | null) => void }>(null);
  const choose = useCallback((title = "Choose an image") => new Promise<MediaItem | null>(resolve => setPicking({ title, resolve })), []);
  const finishPick = useCallback((item: MediaItem | null) => setPicking(p => { p?.resolve(item); return null; }), []);
  const pickerApi = useMemo<MediaPickerApi>(() => ({ status, choose, upload: (file: File) => upload(file) }), [status, choose, upload]);
  return { items, status, load, upload, save, remove, picking, finishPick, pickerApi };
}
export type MediaLibrary = ReturnType<typeof useMediaLibrary>;

/** Why the library can't be used right now, or null when it can. */
function StatusNote({ status, onRetry }: { status: MediaLibraryStatus; onRetry: () => void }) {
  if (status === "ready") return null;
  if (status === "loading") return <p className="studio-empty" role="status">Loading your images…</p>;
  return (
    <div className="studio-media-note" role="note" data-media-status={status}>
      <strong>{status === "denied" ? "The media library isn't switched on yet" : "Couldn't load your images"}</strong>
      <p>{status === "denied"
        ? "Its security rules haven't been deployed, so Studio can't list or save library images yet. Image fields still take a link or Upload image, exactly as before."
        : "Check your connection and try again. Image fields still take a link or Upload image."}</p>
      <SecondaryButton onClick={onRetry}><RefreshCw size={14} aria-hidden /> Try again</SecondaryButton>
    </div>
  );
}

function UploadButton({ label, multiple, disabled, onFiles }: { label: string; multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" accept="image/*" multiple={multiple} hidden aria-label={label}
      onChange={e => { const files = [...(e.target.files || [])]; e.target.value = ""; if (files.length) onFiles(files); }} />
    <PrimaryButton disabled={disabled} onClick={() => input.current?.click()}><ImageUp size={14} aria-hidden /> {label}</PrimaryButton>
  </>;
}

/** Uploads several files one after another, reporting progress and the first failure. */
function useUploader(lib: MediaLibrary) {
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const run = async (files: File[]): Promise<MediaItem[]> => {
    setError("");
    const done: MediaItem[] = [];
    try {
      for (const [i, file] of files.entries()) {
        setProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading and resizing…");
        done.push(await lib.upload(file));
      }
    } catch (err) { setError(uploadErrorMessage(err)); }
    finally { setProgress(""); }
    return done;
  };
  return { run, progress, error };
}

function MediaGrid({ items, onOpen, badges }: { items: MediaItem[]; onOpen: (item: MediaItem) => void; badges?: (item: MediaItem) => string[] }) {
  return (
    <ul className="studio-media-grid" aria-label="Images">
      {items.map(item => (
        <li key={item.id}>
          <button type="button" className="studio-media-card" onClick={() => onOpen(item)} aria-label={`${item.name}${item.alt ? ` — ${item.alt}` : ""}`} data-media-id={item.id}>
            <span className="studio-media-thumb"><img src={thumbUrl(item)} alt="" loading="lazy" decoding="async" /></span>
            <span className="studio-media-name">{item.name}</span>
            {badges && badges(item).length > 0 && <span className="studio-media-badges">{badges(item).map(b => <small key={b}>{b}</small>)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

const FILTERS: { id: MediaFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "unused", label: "Unused" }, { id: "over", label: "Over size budget" }, { id: "noalt", label: "No description" },
];

type Names = Parameters<typeof usagePlaces>[2];
/** `snapshots`: My themes and Version history entries that still hold the picture (restoring them brings it back). */
type Usage = { draft: UsagePlace[]; liveOnly: UsagePlace[]; pages: { slug: string; title: string }[]; snapshots: string[] };
const usageCount = (u: Usage) => u.draft.length + u.liveOnly.length + u.pages.length + u.snapshots.length;
type Snapshots = {
  savedThemes: { name?: string; design?: any }[]; getVersions: () => Promise<{ label?: string; createdAt?: string; design?: any }[]>;
  /** Scheduled designs, campaign restore designs and unexpired share links (Delete checks them too). */
  getStoredDesigns?: () => Promise<{ label?: string; design?: any }[]>;
};

export function StudioMediaPanel({ lib, design, published, pages, names, savedThemes, getVersions, getStoredDesigns, onDesignChange, onOpenPlace, onOpenPage, say, askConfirm }: Snapshots & {
  lib: MediaLibrary; design: any; published: any; pages: any[]; names: Names;
  onDesignChange: (fn: (d: any) => any, label: string) => void;
  onOpenPlace: (place: UsagePlace) => void;
  onOpenPage: (slug: string) => void;
  say: (kind: "ok" | "err", text: string) => void;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const uploader = useUploader(lib);
  // Retained Version history snapshots count as uses too (Delete re-reads them before deleting).
  const [versions, setVersions] = useState<Awaited<ReturnType<Snapshots["getVersions"]>> | null>(null);
  useEffect(() => { let live = true; getVersions().then(v => { if (live) setVersions(v || []); }, () => { if (live) setVersions(null); }); return () => { live = false; }; }, [getVersions]);

  // Where each image is used: the draft, the live design (until the next Publish) and custom pages.
  const draftStrings = useMemo(() => collectStrings(design), [design]);
  const liveStrings = useMemo(() => collectStrings(published), [published]);
  const pageStrings = useMemo(() => (pages || []).map(page => ({ page, strings: collectStrings(page) })), [pages]);
  const usageOf = useCallback((item: MediaItem): Usage => {
    const draft = usagePlaces(design, usagePaths(draftStrings, item), names);
    const live = usagePlaces(published, usagePaths(liveStrings, item), names);
    const inDraft = new Set(draft.map(p => p.label));
    return {
      draft,
      liveOnly: live.filter(p => !inDraft.has(p.label)),
      pages: pageStrings.filter(p => usagePaths(p.strings, item).length).map(p => ({ slug: p.page.slug, title: p.page.title || p.page.slug })),
      snapshots: snapshotUses(item, savedThemes, versions || []),
    };
  }, [design, published, draftStrings, liveStrings, pageStrings, names, savedThemes, versions]);
  const usageById = useMemo(() => new Map(lib.items.map(item => [item.id, usageOf(item)])), [lib.items, usageOf]);
  const isUsed = useCallback((item: MediaItem) => {
    const u = usageById.get(item.id) || usageOf(item);
    return usageCount(u) > 0;
  }, [usageById, usageOf]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, filterMedia(lib.items, "", f.id, isUsed).length])), [lib.items, isUsed]);
  const visible = useMemo(() => filterMedia(lib.items, query, filter, isUsed), [lib.items, query, filter, isUsed]);
  const open = lib.items.find(i => i.id === openId) || null;

  if (lib.status !== "ready") return <div className="studio-media"><StatusNote status={lib.status} onRetry={lib.load} /></div>;
  if (open) return <MediaDetails key={open.id} item={open} usage={usageById.get(open.id) || usageOf(open)} lib={lib} onBack={() => setOpenId(null)}
    savedThemes={savedThemes} getVersions={getVersions} getStoredDesigns={getStoredDesigns} onDesignChange={onDesignChange} onOpenPlace={onOpenPlace} onOpenPage={onOpenPage} say={say} askConfirm={askConfirm} />;

  return (
    <div className="studio-media" data-studio-panel="media">
      <p className="studio-hint">Pictures uploaded here are saved as 480, 960 and 1600 px wide copies, so phones download a small file and big screens a sharp one. Image fields' <strong>Upload image</strong> adds to this library too; section and block images also get the small copies on the shop.</p>
      <div className="studio-media-actions">
        <UploadButton label="Upload images" multiple disabled={!!uploader.progress} onFiles={uploader.run} />
        {uploader.progress && <span role="status">{uploader.progress}</span>}
      </div>
      {uploader.error && <p role="alert" className="studio-upload-error">{uploader.error}</p>}
      <input className="studio-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by file name or description" aria-label="Search images" />
      <div className="studio-media-filters" role="group" aria-label="Show">
        {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} <span>{counts[f.id]}</span></button>)}
      </div>
      {!lib.items.length ? <p className="studio-empty">No images yet. Upload pictures here, or use <strong>Upload image</strong> on any image field.</p>
        : !visible.length ? <p className="studio-empty">No images match. Try another word or show All.</p>
        : <MediaGrid items={visible} onOpen={item => setOpenId(item.id)} badges={item => [
            ...(!isUsed(item) ? ["Unused"] : []), ...(isOverBudget(item) ? ["Over budget"] : []), ...(missingAlt(item) ? ["No description"] : []),
          ]} />}
    </div>
  );
}

function MediaDetails({ item, usage, lib, onBack, savedThemes, getVersions, getStoredDesigns, onDesignChange, onOpenPlace, onOpenPage, say, askConfirm }: Snapshots & {
  item: MediaItem; usage: Usage; lib: MediaLibrary; onBack: () => void;
  onDesignChange: (fn: (d: any) => any, label: string) => void;
  onOpenPlace: (place: UsagePlace) => void; onOpenPage: (slug: string) => void;
  say: (kind: "ok" | "err", text: string) => void;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [alt, setAlt] = useState(item.alt || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const replaceInput = useRef<HTMLInputElement>(null);
  const used = usageCount(usage);

  const act = async (label: string, run: () => Promise<void>) => {
    setBusy(label); setError("");
    try { await run(); } catch (err) { setError(uploadErrorMessage(err)); } finally { setBusy(""); }
  };
  const saveItem = (next: MediaItem, designLabel: string) => act("Saving…", async () => {
    await lib.save(next);
    // Places in the draft get the new description / files at once (one undoable change; Publish shows shoppers).
    onDesignChange(d => applyMediaChange(d, item, next), designLabel);
  });
  const setFocal = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const focalX = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    const focalY = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)));
    saveItem({ ...item, focalX, focalY, updatedAt: new Date().toISOString() }, "Image focal point");
  };
  const remove = async () => {
    if (used) { setError("This image is still in use. Remove it from the places listed under Where it's used (and publish) before deleting it."); return; }
    // Version history may have changed since the list was read: check the retained versions again first.
    let versions;
    try { versions = await getVersions(); }
    catch { setError("Couldn't check Version history for this image, so it wasn't deleted. Check your connection and try again."); return; }
    const kept = snapshotUses(item, savedThemes, versions || []);
    if (kept.length) { setError(`This image is kept in ${kept.join(", ")}. Restoring that would bring it back, so it can't be deleted yet.`); return; }
    // Scheduled designs, a running campaign's restore design and share links keep pictures too.
    let stored;
    try { stored = getStoredDesigns ? await getStoredDesigns() : []; }
    catch { setError("Couldn't check scheduled designs and share links for this image, so it wasn't deleted. Check your connection and try again."); return; }
    const scheduled = storedDesignUses(item, stored || []);
    if (scheduled.length) { setError(`This image is used by ${scheduled.join(", ")}. It would break when that goes live or is opened, so it can't be deleted yet. Cancel that schedule (Theme actions › Schedule publishing) or revoke the share link (Themes › Share a preview link) first.`); return; }
    const ok = await askConfirm({ title: "Delete this image?", message: `“${item.name}” and all its sizes will be removed from your library and storage. This can't be undone.`, confirmLabel: "Delete image" });
    if (!ok) return;
    await act("Deleting…", async () => { 
      const leftOver = await lib.remove(item);
      if (leftOver.length) say("err", `Image removed from your library, but ${leftOver.length === 1 ? "1 stored file" : `${leftOver.length} stored files`} couldn't be deleted from storage. They're no longer used anywhere.`);
      else say("ok", "Image deleted.");
      onBack();
    });
  };

  const sized = [...item.variants].sort((a, b) => a.w - b.w);
  const place = (p: UsagePlace, live: boolean): ReactNode => (
    <li key={`${live}:${p.label}`}>{p.sectionId && !live
      ? <button type="button" className="studio-link-button" onClick={() => onOpenPlace(p)}>{p.label}</button>
      : <span>{p.label}{live && <small> — live site, until you publish</small>}</span>}</li>
  );

  return (
    <div className="studio-media" data-studio-panel="media-details">
      <button type="button" className="studio-reset" onClick={onBack}><ArrowLeft size={12} aria-hidden /> All images</button>
      <h3 className="studio-media-title">{item.name}</h3>
      <button type="button" className="studio-media-focal" onClick={setFocal} disabled={!!busy}
        aria-label="Set the focal point: click the part of the picture that must stay in view when it's cropped">
        <img src={mainUrl(item)} alt="" />
        <span className="studio-media-dot" style={{ left: `${item.focalX ?? 50}%`, top: `${item.focalY ?? 50}%` }} aria-hidden />
      </button>
      <p className="studio-hint">Click the picture to set its focal point — the part kept in view when a section crops it. It's used when you place the image somewhere new.</p>
      <p className="studio-media-facts">{item.width > 0 ? `${item.width} × ${item.height} px` : "Original file"} · {formatBytes(item.bytes)} in total</p>
      <table className="studio-media-sizes">
        <caption>Sizes shoppers download</caption>
        <thead><tr><th scope="col">Width</th><th scope="col">File</th><th scope="col">Budget</th></tr></thead>
        <tbody>{sized.map(v => {
          const over = v.bytes > budgetFor(v.w);
          return <tr key={v.path || v.url}><td>{v.w > 0 ? `${v.w} px` : "Original"}</td><td>{formatBytes(v.bytes)}</td>
            <td data-over={over || undefined}>{over ? `⚠ over ${formatBytes(budgetFor(v.w))}` : `✓ under ${formatBytes(budgetFor(v.w))}`}</td></tr>;
        })}</tbody>
      </table>
      {isOverBudget(item) && <p className="studio-hint">Large files slow the page down. Replace it with a smaller or simpler picture if you can.</p>}

      <div className="rp-field studio-field">
        <label className="rp-label" htmlFor={`media-alt-${item.id}`}>Picture description (read aloud to blind visitors and used by Google)</label>
        <textarea id={`media-alt-${item.id}`} className="rp-input" rows={3} value={alt} onChange={e => setAlt(e.target.value)}
          placeholder="What's in the picture, for people using screen readers" />
        <small className="studio-hint">Used wherever this picture appears without its own description.</small>
        <SecondaryButton disabled={!!busy || alt.trim() === (item.alt || "").trim()}
          onClick={() => saveItem({ ...item, alt: alt.trim(), updatedAt: new Date().toISOString() }, "Image description")}>Save description</SecondaryButton>
      </div>

      <section className="studio-media-usage" aria-label="Where it's used">
        <h4>Where it's used</h4>
        {!used ? <p className="studio-hint">Not used anywhere yet — not in your draft, the live site, a page, My themes or Version history.</p> : <ul>
          {usage.draft.map(p => place(p, false))}
          {usage.liveOnly.map(p => place(p, true))}
          {usage.snapshots.map(label => <li key={`snap:${label}`}><span>{label}<small> — saved copy of your design</small></span></li>)}
          {usage.pages.map(p => <li key={`page:${p.slug}`}><button type="button" className="studio-link-button" onClick={() => onOpenPage(p.slug)}>Page “{p.title}”</button></li>)}
        </ul>}
      </section>

      <div className="studio-media-actions">
        <input ref={replaceInput} type="file" accept="image/*" hidden aria-label="Replace image file"
          onChange={e => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (!file) return;
            act("Replacing…", async () => {
              const next = await lib.upload(file, item);
              onDesignChange(d => applyMediaChange(d, item, next), "Replace image");
              say("ok", usage.draft.length ? "Image replaced everywhere in your draft. Publish to show shoppers." : "Image replaced.");
            });
          }} />
        <SecondaryButton disabled={!!busy} onClick={() => replaceInput.current?.click()}><RefreshCw size={14} aria-hidden /> Replace image…</SecondaryButton>
        <SecondaryButton disabled={!!busy} onClick={() => {
          if (!navigator.clipboard?.writeText) { say("err", `Couldn't copy the link here. Copy it by hand: ${mainUrl(item)}`); return; }
          navigator.clipboard.writeText(mainUrl(item)).then(() => say("ok", "Image link copied."), () => say("err", "Couldn't copy the link."));
        }}><Copy size={14} aria-hidden /> Copy link</SecondaryButton>
        <SecondaryButton disabled={!!busy} onClick={remove}><Trash2 size={14} aria-hidden /> Delete image</SecondaryButton>
      </div>
      {busy && <p role="status" className="studio-hint">{busy}</p>}
      {error && <p role="alert" className="studio-upload-error">{error}</p>}
    </div>
  );
}

/** The "Choose an image" dialog opened by image fields' Choose from library. */
export function MediaPickerDialog({ lib }: { lib: MediaLibrary }) {
  const [query, setQuery] = useState("");
  const uploader = useUploader(lib);
  const visible = useMemo(() => filterMedia(lib.items, query, "all", () => true), [lib.items, query]);
  if (!lib.picking) return null;
  return (
    <Dialog open onClose={() => lib.finishPick(null)} title={lib.picking.title} size="lg"
      description="Pick a picture from your library, or upload a new one — it's resized for every screen."
      footer={<SecondaryButton onClick={() => lib.finishPick(null)}>Cancel</SecondaryButton>}>
      <div className="studio-media">
        {lib.status !== "ready" ? <StatusNote status={lib.status} onRetry={lib.load} /> : <>
          <div className="studio-media-actions">
            <UploadButton label="Upload new image" disabled={!!uploader.progress}
              onFiles={async files => { const [item] = await uploader.run(files.slice(0, 1)); if (item) lib.finishPick(item); }} />
            {uploader.progress && <span role="status">{uploader.progress}</span>}
          </div>
          {uploader.error && <p role="alert" className="studio-upload-error">{uploader.error}</p>}
          <input className="studio-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by file name or description" aria-label="Search images" />
          {!lib.items.length ? <p className="studio-empty">Your library is empty. Upload a picture to use it here.</p>
            : !visible.length ? <p className="studio-empty">No images match that search.</p>
            : <MediaGrid items={visible} onOpen={item => lib.finishPick(item)} badges={item => (missingAlt(item) ? ["No description"] : [])} />}
        </>}
      </div>
    </Dialog>
  );
}
