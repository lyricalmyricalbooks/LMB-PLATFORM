import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Copy, ExternalLink, LayoutTemplate, Plus, Sparkles, Trash2 } from "lucide-react";
import { adminApi } from "../api";
import { autoSeo, duplicatePage, missingSeo, movePage, seoHints } from "../pageInsights";
import { dataUrlToFile, firstBodyImage, pageBodyText, pastedImageSources, replaceImageSources } from "../../features/site/pageBody";
import { PageBodyEditor, uploadPagePicture } from "./PageBodyEditor";
import { ImageUploadButton } from "./ImageUploadButton";
import { mainUrl } from "./mediaLibrary";
import { useMediaPicker } from "./mediaPicker";
import { uploadErrorMessage } from "./mediaUpload";
import type { Page } from "../../features/site/types";
import { reconcileSavedPage } from "./studioWorkflow";
import { askAi } from "../aiWriter";
import { PAGE_STARTERS, pageFromStarter, type PageStarter } from "./pageStarters";

// Where a page's link appears on the shop. "Header and footer" is the old "Include in the storefront header"
// (header pages have always been in the footer too); "Footer only" sets `showInFooter` (footerNavigation `pageInFooter`).
const LINK_PLACEMENTS = [
  { id: "both", label: "Header and footer", hint: "(the default for new pages)", short: "In header & footer" },
  { id: "footer", label: "Footer only", hint: "(e.g. Stockists, FAQ)", short: "Footer only" },
  { id: "none", label: "Not linked", hint: "(reachable by its web address only)", short: "Not in menus" },
] as const;
const linkPlacement = (p: Partial<Page>) => (p.showInNav ?? true) ? "both" : p.showInFooter ? "footer" : "none";
import { useConfirm } from "../riso/components";
import { friendlyError } from "./friendlyError";

const btn =
  "inline-flex items-center gap-1.5 px-3 h-9 text-xs font-bold border border-neutral-300 rounded-lg bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary =
  "inline-flex items-center gap-1.5 px-4 h-9 text-xs font-bold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed";
const iconBtn = "inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-md text-neutral-600 hover:bg-neutral-200 disabled:opacity-30";
const input = "w-full border border-neutral-200 rounded-lg px-3 h-9 text-xs";

const toSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
const publicUrl = (slug?: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/page/${slug || ""}`;

type Say = (kind: "ok" | "err", text: string) => void;

const asIs = (title: string) => title;

/** Custom storefront pages, managed inside the Studio editor (Pages tab). Pages save immediately — they are not part of the theme draft. */
export function StudioPages({ pages, setPages, say, onEditSections, onDraft, onShow, onReorder, onAddressChange, openSlug, active = true, onBusy, loadError = false, onRetryLoad, formatTitle = asIs, fillSeoRequest }: {
  pages: Page[]; setPages: (fn: (p: Page[]) => Page[]) => void; say: Say; onEditSections: (slug: string) => void;
  /** A saved page moved from /page/<from> to /page/<to>: Studio repoints menu links and forwards the old address. */
  onAddressChange?: (from: string, to: string, wasPublished: boolean) => Promise<string | void> | string | void;
  /** Receives the page being edited (unsaved) so the preview can show it before Save; null when closed. */
  onDraft?: (page: Partial<Page> | null) => void;
  /** Called with a page's address when it is opened or first saved, so the preview can show that page. */
  onShow?: (slug: string) => void;
  /** Called with the pages in their new order after an up/down move, so the header bar follows. */
  onReorder?: (ordered: Page[]) => void;
  /** Opens this page's editor (set by Studio's Find anything); `nonce` re-triggers the same slug. */
  openSlug?: { slug: string; nonce: number } | null;
  active?: boolean;
  onBusy?: (busy: boolean) => void;
  loadError?: boolean;
  onRetryLoad?: () => void;
  /** The shop's tab-title format (Text & labels › Site & sharing › Other pages' tab title), so search
   *  titles are measured and previewed as shoppers' browsers and Google receive them. */
  formatTitle?: (title: string) => string;
  /** Changing nonce = run "Fill in missing search listings" (Studio's Find anything command). */
  fillSeoRequest?: number;
}) {
  const [askConfirm, confirmNode] = useConfirm();
  const media = useMediaPicker();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Partial<Page> | null>(null);
  const [original, setOriginal] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  // New page › the starter gallery (Block library 3.0).
  const [starters, setStarters] = useState(false);
  const dirty = !!editing && JSON.stringify(editing) !== original;
  useEffect(() => { onDraft?.(dirty ? editing : null); }, [dirty, editing, onDraft]);
  useEffect(() => () => onDraft?.(null), [onDraft]);
  const ordered = useMemo(() => [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [pages]);

  // Bumped each time a page opens, so a slow AI draft never lands on a different page.
  const openCount = useRef(0);
  const open = (p: Partial<Page>, fresh: boolean) => { openCount.current += 1; setEditing(p); setOriginal(JSON.stringify(p)); setIsNew(fresh); setSlugEdited(!fresh); setError(""); if (!fresh && p.slug) onShow?.(p.slug); };
  const openStarter = (starter: PageStarter) => {
    setStarters(false);
    open(pageFromStarter(starter, pages), true);
    if (starter.id !== "blank") say("ok", `${starter.label} page started as a draft. Replace the words in [brackets], then tick Published and Save.`);
  };
  // Requests already handled, so a page list refresh doesn't reopen the page; an unmatched request waits for the pages to load.
  const handledOpen = useRef<number | null>(null);
  useEffect(() => {
    if (!openSlug || handledOpen.current === openSlug.nonce) return;
    const page = pages.find((p) => p.slug === openSlug.slug);
    if (!page) return;
    handledOpen.current = openSlug.nonce;
    if (editing && editing.id === page.id) { onShow?.(page.slug); return; }
    (async () => {
      if (locked.current) return;
      if (dirty && !(await askConfirm({ title: "Discard page changes?", message: `Your unsaved changes to “${editing?.title || "this page"}” will be lost if you open “${page.title}”.`, confirmLabel: "Discard and open" }))) return;
      open(page, false);
    })();
  }, [openSlug?.nonce, pages]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = async () => {
    if (locked.current) return;
    if (dirty && !(await askConfirm({ title: "Discard page changes?", message: "Your unsaved changes to this page will be lost.", confirmLabel: "Discard changes" }))) return;
    openCount.current += 1;
    setEditing(null);
  };

  async function save() {
    if (!editing || locked.current) return;
    if (uploading) return setError("Wait for the pictures to finish uploading.");
    if (!editing.title?.trim()) return setError("Give the page a title.");
    if (!editing.slug?.trim()) return setError("A web address is required.");
    if (pages.some((p) => p.slug === editing.slug && p.id !== editing.id)) return setError("Another page already uses this web address.");
    const captured = JSON.parse(JSON.stringify(editing));
    // What the editor held before pasted pictures were uploaded, so a body left untouched during the save takes the uploaded links.
    const sent = JSON.parse(JSON.stringify(editing));
    locked.current = true; setError(""); setSaving(true); onBusy?.(true);
    try {
      // Pasted pictures arrive as data: text; upload them so the page record stays small and loads fast.
      const pasted = pastedImageSources(captured.body || "");
      if (pasted.length) {
        const swaps: Record<string, string> = {};
        for (const [i, src] of pasted.entries()) {
          const file = dataUrlToFile(src, `${captured.slug || "page"}-picture-${i + 1}`);
          if (!file) throw new Error("A pasted picture couldn't be read. Remove it and add it again with Add pictures.");
          try { swaps[src] = (await uploadPagePicture(media, file)).url; }
          catch (err) { throw new Error(uploadErrorMessage(err)); }
        }
        captured.body = replaceImageSources(captured.body, swaps);
      }
      let next: Page;
      if (isNew) { next = await adminApi.createPage(captured); setPages((prev) => [...prev, next]); setIsNew(false); setSlugEdited(true); if (next.slug) onShow?.(next.slug); }
      else { next = await adminApi.updatePage(captured.id!, captured); setPages((prev) => prev.map((p) => (p.id === next.id ? next : p))); }
      const before = isNew ? null : JSON.parse(original || "null");
      setEditing(current => reconcileSavedPage(current, sent, next)); setOriginal(JSON.stringify(next));
      const moved = before?.slug && next.slug && before.slug !== next.slug;
      const followUp = moved ? await Promise.resolve(onAddressChange?.(before.slug, next.slug!, before.status === "published")).catch(() =>
        `The page's address changed, but its old links couldn't be updated. Check Navigation and Settings › URL redirects.`) : "";
      say("ok", `Page saved.${followUp ? ` ${followUp}` : ""} Any newer edits remain unsaved.`);
    } catch (e: any) { say("err", friendlyError(e, "save the page", { keepsChanges: true })); }
    finally { locked.current = false; setSaving(false); onBusy?.(false); }
  }

  useEffect(() => {
    if (!active) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  async function remove(p: Partial<Page>) {
    if (locked.current || !p.id) return;
    if (!(await askConfirm({ title: "Delete page?", message: `“${p.title}” will be removed from the storefront and its menu. This can't be undone.`, confirmLabel: "Delete page" }))) return;
    try { await adminApi.deletePage(p.id); setPages((prev) => prev.filter((x) => x.id !== p.id)); setEditing(null); say("ok", "Page deleted."); }
    catch { say("err", "Could not delete the page."); }
  }

  // Pages whose search title or description is blank and could be written from the page itself.
  const needsSeo = ordered.filter((p) => Object.keys(missingSeo(p, formatTitle)).length);
  async function fillAllSeo() {
    if (locked.current || !needsSeo.length) return;
    const count = needsSeo.length;
    if (!(await askConfirm({
      title: "Fill in missing search listings?",
      message: `${count === 1 ? "1 page has" : `${count} pages have`} a blank search title or description. Each blank one is written from that page's title and opening sentences and saved straight away. Listings you already wrote stay as they are.`,
      confirmLabel: count === 1 ? "Fill in 1 page" : `Fill in ${count} pages`,
    }))) return;
    locked.current = true; setFilling(true); onBusy?.(true);
    let done = 0;
    try {
      for (const p of needsSeo) {
        const patch = missingSeo(p, formatTitle);
        try {
          await adminApi.updatePage(p.id, { title: p.title, ...patch });
          setPages((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...patch } : x)));
          done++;
        } catch { /* counted below; the rest still run */ }
      }
    } finally { locked.current = false; setFilling(false); onBusy?.(false); }
    if (done === count) say("ok", done === 1 ? "Filled in the search listing for 1 page." : `Filled in search listings for ${done} pages.`);
    else say("err", `Filled in ${done} of ${count} pages. The others couldn't be saved — try again.`);
  }

  useEffect(() => {
    if (!fillSeoRequest) return;
    if (editing) { say("ok", "Close this page first (All pages), then fill in the missing search listings."); return; }
    if (!needsSeo.length) { say("ok", "Every page already has a search title and description."); return; }
    fillAllSeo();
  }, [fillSeoRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  async function move(id: string, dir: -1 | 1) {
    const updates = movePage(ordered, id, dir);
    if (!updates.length) return;
    const results = await Promise.allSettled(updates.map((u) => adminApi.updatePage(u.id, { ...pages.find((p) => p.id === u.id), order: u.order })));
    // Apply only the orders that were saved, so the list matches what the shop has.
    const savedUpdates = updates.filter((_, i) => results[i].status === "fulfilled");
    if (savedUpdates.length) {
      const next = pages.map((p) => { const u = savedUpdates.find((x) => x.id === p.id); return u ? { ...p, order: u.order } : p; });
      setPages(() => next);
      onReorder?.([...next].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    }
    if (savedUpdates.length < updates.length) say("err", "Could not reorder pages. The list shows the order that was saved — try again.");
  }

  if (editing) {
    const set = (patch: Partial<Page>) => setEditing((p) => ({ ...p, ...patch }));
    const autoFill = async () => {
      const auto = autoSeo(editing, formatTitle);
      if (!auto.seoTitle && !auto.metaDescription) return setError("Write the page title and some text first, then auto-fill.");
      const blanks = missingSeo(editing, formatTitle);
      if (Object.keys(blanks).length) {
        set(blanks);
        say("ok", "Google listing filled in from the page. Check it, then Save page.");
        return;
      }
      if (auto.seoTitle === editing.seoTitle && auto.metaDescription === editing.metaDescription) return say("ok", "The Google listing already matches the page.");
      if (!(await askConfirm({ title: "Replace your Google listing?", message: "Your Google title and description will be rewritten from the page's title and opening sentences. Nothing is saved until you press Save page.", confirmLabel: "Replace" }))) return;
      set(auto);
      say("ok", "Google listing rewritten from the page. Check it, then Save page.");
    };
    // Write with AI (Gemini, Settings › General › AI writing assistant): same rule as Auto-fill. The storefront wraps
    // the search title in the shop's title format, so the server is told how much room that takes.
    const writeWithAi = async () => {
      if (!(editing.title || "").trim() && !pageBodyText(editing.body || "").trim()) return say("err", "Write the page title or some text first.");
      const written = (editing.seoTitle || "").trim() || (editing.metaDescription || "").trim();
      if (written && !(await askConfirm({ title: "Rewrite your Google listing with AI?", message: "The AI writes a new Google title and description from the page. Nothing is saved until you press Save page.", confirmLabel: "Rewrite" }))) return;
      setAiBusy(true);
      const opened = openCount.current;
      try {
        const out = await askAi("pageSeo", { title: editing.title || "", text: pageBodyText(editing.body || "") }, { titleSuffix: Math.max(0, formatTitle("").length) });
        if (opened !== openCount.current) return;
        const patch = { ...(out.seoTitle ? { seoTitle: out.seoTitle } : {}), ...(out.metaDescription ? { metaDescription: out.metaDescription } : {}) };
        setEditing((p) => (p && opened === openCount.current ? { ...p, ...patch } : p));
        say("ok", "Google listing drafted with AI. Check it, then Save page.");
      } catch (err: any) {
        say("err", friendlyError(err, "write the search listing with AI"));
      } finally {
        setAiBusy(false);
      }
    };
    return (
      <div className="p-4 space-y-4">
        {confirmNode}
        <div className="flex items-center gap-2">
          <button className={btn} onClick={back} disabled={saving}><ArrowLeft size={14} /> All pages</button>
          {!isNew && editing.status === "published" && (
            <a className={btn} href={publicUrl(editing.slug)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> View</a>
          )}
        </div>
        {error && <p role="alert" className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
        <label className="block">
          <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Page title</span>
          <input className={input} value={editing.title || ""} placeholder="e.g. About the press"
            onChange={(e) => set({ title: e.target.value, slug: slugEdited ? editing.slug : toSlug(e.target.value) })} />
        </label>
        <label className="block">
          <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Web address</span>
          <input className={`${input} font-mono`} value={editing.slug || ""} placeholder="about-us"
            onChange={(e) => { setSlugEdited(true); set({ slug: toSlug(e.target.value) }); }} />
          <span className="text-[11px] text-neutral-500 break-all">{publicUrl(editing.slug || "…")}</span>
        </label>
        <div>
          <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Body</span>
          <PageBodyEditor value={editing.body || ""} onChange={(v) => set({ body: v })} onUploading={setUploading} title={editing.title} />
        </div>
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={editing.status === "published"} onChange={(e) => set({ status: e.target.checked ? "published" : "draft" })} /> Published <span className="font-normal text-neutral-500">(drafts are hidden from the shop)</span></label>
          <fieldset className="space-y-1">
            <legend className="text-xs font-bold">Where the link shows</legend>
            {LINK_PLACEMENTS.map(({ id, label, hint }) => (
              <label key={id} className="flex items-start gap-2 text-xs">
                <input type="radio" className="mt-0.5" name="page-link-placement" checked={linkPlacement(editing) === id}
                  onChange={() => set({ showInNav: id === "both", showInFooter: id === "footer" })} />
                <span><span className="font-bold">{label}</span> <span className="text-neutral-500">{hint}</span></span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="space-y-2 border-t border-neutral-200 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold">Google listing (SEO)</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={saving} onClick={autoFill}
                title="Write the Google title and description from this page's title and opening sentences">
                <Sparkles size={13} aria-hidden /> Auto-fill from page
              </button>
              <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={saving || aiBusy} onClick={() => void writeWithAi()}
                title="Draft the Google title and description with AI (Settings › General › AI writing assistant)">
                <Sparkles size={13} aria-hidden /> {aiBusy ? "Writing…" : "Write with AI"}
              </button>
            </div>
          </div>
          <input className={input} value={editing.seoTitle || ""} placeholder={editing.title || "Title on Google"} aria-label="Title on Google" onChange={(e) => set({ seoTitle: e.target.value })} />
          <textarea className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-xs" rows={3} maxLength={320} aria-label="Description on Google"
            value={editing.metaDescription || ""} placeholder="A short summary shown under your title on Google…" onChange={(e) => set({ metaDescription: e.target.value })} />
          <div className="space-y-1">
            <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block">Sharing image</span>
            <div className="flex items-start gap-2">
              {(editing.seoImage || firstBodyImage(editing.body || "")) ? (
                <img src={editing.seoImage || firstBodyImage(editing.body || "")} alt="" className="w-20 h-12 object-cover rounded border border-neutral-200 shrink-0" />
              ) : <div className="w-20 h-12 rounded border border-dashed border-neutral-300 shrink-0" aria-hidden />}
              <p className="text-[11px] text-neutral-600">
                {editing.seoImage ? "Shown when this page is shared on social media and in search results."
                  : firstBodyImage(editing.body || "") ? "Using the first picture on the page. Pick another to change it."
                  : "None yet — the shop's share image (Theme settings › Logo & wordmark) is used."}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <ImageUploadButton label="Upload sharing image" disabled={saving}
                onUploaded={(url) => set({ seoImage: url })} />
              {media && media.status === "ready" && (
                <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={saving}
                  onClick={async () => { try { const item = await media.choose("Choose a sharing image"); if (item) set({ seoImage: mainUrl(item) }); } catch (err) { setError(uploadErrorMessage(err)); } }}>
                  Choose from library
                </button>
              )}
              {editing.seoImage && <button type="button" className="rp-btn rp-btn-secondary rp-btn-sm" disabled={saving} onClick={() => set({ seoImage: "" })}>Use the page's first picture</button>}
            </div>
          </div>
          <SearchPreview url={publicUrl(editing.slug || "…")}
            title={formatTitle((editing.seoTitle || editing.title || "").trim() || "Page title")}
            description={(editing.metaDescription || "").trim() || pageBodyText(editing.body || "").substring(0, 160)} />
          <ul className="text-[11px] text-neutral-600 space-y-0.5">
            {seoHints(editing.title || "", editing.seoTitle || "", editing.metaDescription || "", formatTitle).map((h) => (
              <li key={h.text}>{h.level === "good" ? "✓ " : "⚠ "}{h.text}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 sticky bottom-0 z-10 bg-white pb-2">
          <button className={btnPrimary} onClick={save} disabled={saving || uploading || (!dirty && !isNew)}>{saving ? "Saving…" : uploading ? "Uploading pictures…" : isNew ? "Create page" : "Save page"}</button>
          {!isNew && editing.slug && <button className={btn} disabled={saving} onClick={() => onEditSections(editing.slug!)}><LayoutTemplate size={13} /> Design sections</button>}
          {!isNew && <button className={`${btn} text-red-700`} disabled={saving} onClick={() => remove(editing)}><Trash2 size={13} /> Delete</button>}
          {dirty && <span className="text-[11px] text-neutral-500">Unsaved changes</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {confirmNode}
      {loadError && <div role="alert" className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between gap-3"><span>Pages could not be loaded. Your existing list is preserved.</span><button className={btn} onClick={onRetryLoad}>Retry</button></div>}
      <div>
        <p className="text-sm font-bold">Pages</p>
        <p className="text-xs text-neutral-500">Write About, Shipping or Journal pages. Blank pages and most starters are added to the storefront header and footer; each page chooses under “Where the link shows” (Header and footer, Footer only, or Not linked). Pages save straight away and don't need Publish. Use “Design sections” to lay out a page with banners and galleries.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={btnPrimary} onClick={() => setStarters(v => !v)} disabled={filling} aria-expanded={starters} aria-controls="studio-page-starters"><Plus size={14} /> New page</button>
        {needsSeo.length > 0 && (
          <button className={btn} onClick={fillAllSeo} disabled={filling}>
            <Sparkles size={13} aria-hidden /> {filling ? "Filling in…" : `Fill in missing search listings (${needsSeo.length})`}
          </button>
        )}
      </div>
      {starters && (
        <section id="studio-page-starters" data-studio-page-starters aria-label="Start a page from" className="border border-neutral-200 rounded-lg p-3 bg-white space-y-2"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setStarters(false); } }}>
          <p className="text-xs font-bold">Start from</p>
          <p className="text-[11px] text-neutral-500">Each one opens with headings and [prompts] to replace, as a draft shoppers can't see. Nothing is saved until you press Save.</p>
          <div className="grid grid-cols-2 gap-2">
            {PAGE_STARTERS.map((starter, i) => (
              <button key={starter.id} type="button" autoFocus={i === 0} data-page-starter={starter.id} onClick={() => openStarter(starter)}
                className="text-left border border-neutral-300 rounded-md p-2 hover:border-neutral-900 focus-visible:border-neutral-900 space-y-1">
                <span className="block text-xs font-bold">{starter.label}</span>
                <span className="block text-[11px] text-neutral-500">{starter.summary}</span>
                {starter.outline.length > 0 && <span className="block text-[10px] font-mono text-neutral-500">{starter.outline.join(" · ")}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {ordered.length === 0 && <p className="text-xs text-neutral-500 border border-dashed border-neutral-300 rounded-lg p-4">No pages yet. Create one and it can appear in your storefront menu.</p>}
      {ordered.map((p, i) => (
        <div key={p.id} className="border border-neutral-200 rounded-lg p-2 bg-white space-y-1">
          <div className="flex items-center gap-1">
            <button className="flex-1 min-w-0 text-left" onClick={() => open({ ...p }, false)} aria-label={`Edit ${p.title}`}>
              <p className="text-xs font-bold truncate">{p.title}</p>
              <p className="text-[11px] text-neutral-500 font-mono truncate">/page/{p.slug}</p>
            </button>
            <button className={iconBtn} disabled={i === 0} onClick={() => move(p.id, -1)} aria-label={`Move ${p.title} up in menu`}><ChevronUp size={14} /></button>
            <button className={iconBtn} disabled={i === ordered.length - 1} onClick={() => move(p.id, 1)} aria-label={`Move ${p.title} down in menu`}><ChevronDown size={14} /></button>
            <button className={iconBtn} onClick={() => open(duplicatePage(p, pages), true)} aria-label={`Duplicate ${p.title}`}><Copy size={14} /></button>
            <button className={iconBtn} onClick={() => remove(p)} aria-label={`Delete ${p.title}`}><Trash2 size={14} /></button>
          </div>
          <p className="text-[11px] text-neutral-600">
            {p.status === "published" ? "✓ Published" : "○ Draft"} · {LINK_PLACEMENTS.find(x => x.id === linkPlacement({ ...p, showInNav: !!p.showInNav }))?.short}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Roughly how Google lists the page (it may rewrite titles and snippets). Mirrors what PageView sends:
 *  the search title in the shop's tab-title format and the description, else the start of the page text. */
function SearchPreview({ url, title, description }: { url: string; title: string; description: string }) {
  const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  return (
    <div className="border border-neutral-200 rounded-lg p-3 bg-white" aria-label="Search result preview">
      <span className="text-[10px] font-black tracking-widest uppercase text-neutral-500 block mb-1">Search preview · approximate</span>
      <p className="text-[11px] text-neutral-600 break-all">{url}</p>
      <p className="text-sm leading-snug text-blue-800">{cut(title, 60)}</p>
      <p className="text-xs leading-snug text-neutral-700">{description ? cut(description, 160) : "Add a description or some page text."}</p>
    </div>
  );
}
