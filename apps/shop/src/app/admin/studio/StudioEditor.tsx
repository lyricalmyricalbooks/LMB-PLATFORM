import { DESKTOP_WIDTHS, DESKTOP_WIDTH_LABELS, WIDTH_KEYS, fillsScreen, isDesktopWidth, screenForWidth, type DesktopWidth } from "./previewWidth";
import { StudioCopyField, CopyTargetContext } from "./StudioCopyField";
import { StudioRegionBrowser } from "./StudioRegionBrowser";
import { REGION_GROUPS, REGION_SUFFIXES, REGION_DEVICE_LABELS, regionFieldDevice, regionKey, regionValue, type RegionDevice } from "../../features/site/storefrontRegions";
import { canInlineFormat } from "./richText";
import { applyContextAction, applySpacing, contextCapabilities, GAP_KEYS, PADDING_KEYS } from "./canvasTools";
import { createContext, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles,
  ArrowLeft, ChevronDown, Clock, ChevronUp, Clipboard, Copy, Eye, History, Monitor, Plus, Redo2, Search, ShieldCheck, Smartphone,
  Download, Globe, ListChecks, Pencil, Tablet, Trash2, Undo2, Upload,
} from "lucide-react";
import { adminApi } from "../api";
import { uploadStudioImage } from "./mediaUpload";
import {
  SECTION_REGISTRY, SectionFieldEditor, buildPageTemplates, type PageTemplateMeta,
  getBlockFields, getBlocksKey, getSectionFields, fieldBounds, getSectionMeta, DEFAULT_COLOR_SCHEMES,
} from "../ThemeEditorExtensions";
import { CATEGORIES } from "../../features/site/constants";
import { designEqual } from "../../features/site/designEqual";
import { splitNavigation, buildNavItems, moveNavItem, normalizeCategories, parentOf, reslotPages } from "../../features/site/navItems";
import { COPY_SCHEMA, DEFAULT_COPY, getCopy } from "../../features/site/storeCopy";
import { automaticFooterItems, footerGroup } from "../../features/site/footerNavigation";
import { MENU_LINK_TYPES, newMenuItem, slugify, type MenuItem } from "../../features/site/storeMenu";
import {
  commit, duplicateSection, findBlock, getSections, initHistory, insertBlockAfter, insertSection, makeSection, mapBlock, newId, normalizeDesign,
  HISTORY_LIMIT, jumpBy, patchSectionSettings, redo, removeSection, sameDesign, setSections, toggleSection, undo, undoLabel, redoLabel, moveSection,
  resolveSharedBlocks, withPageText, type Section, type SectionTarget, type SharedBlock,
} from "./studioModel";
import { menuLinksTo, redirectsAfterRename, renamePageInMenus } from "./pageRename";
import { STATIC_SURFACES, STYLE_GROUPS, STYLE_TARGET_FIELDS, applyGlobalStyle, readStyle, regionStyleFields, schemeFieldOptions, type StyleField, type StyleGroup } from "./styleSchema";
import { StudioColorSchemes } from "./StudioColorSchemes";
import { StudioScalePreview } from "./StudioScalePreview";
import { applyGridMessage } from "./gridPlacement";
import { StudioAnnouncements } from "./StudioAnnouncements";
import { StudioPages } from "./StudioPages";
import { StudioCategories } from "./StudioCategories";
import { categoryNavOrder } from "./categoryManager";
import { PREVIEW_BRIDGE_SOURCE } from "./previewBridge";
import { RISO_NOIR_ID, RISO_NOIR_TOKENS } from "../../features/site/risoNoir";
import { addSavedTheme, duplicateSavedTheme, parseThemeFile, removeSavedTheme, renameSavedTheme, savedThemeLimitProblem, serializeThemeFile, themeFileName, themeNamed, type SavedTheme } from "./savedThemes";
import { PAYMENT_BADGE_OPTIONS, resolveFooterBadges } from "../../features/site/paymentBadges";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { applyThemeKeysToSurfaces } from "../themeScope";
import { THEME_LIBRARY, PALETTES, THEME_APPLIED_KEYS } from "./themeLibrary";
import { StudioOutline, blockLabel } from "./StudioOutline";
import { StudioStructure } from "./StudioStructure";
import { StudioElementInspector } from "./StudioElementInspector";
import { elementTabs, type ElementRef } from "./elementCatalog";
import { buildPageStructure, primaryTarget, readStructure, structurePath, type PageStructure, type StructureItem } from "./pageStructure";
import { StudioInspector } from "./StudioInspector";
import { StudioSearch } from "./StudioSearch.tsx";
import { buildStudioIndex, contextCommands, searchedDevice, type SearchEntry } from "./studioSearch";
import { resolveProductRoutes } from "../../features/site/productRoutes";
import { groupLabel, isGroupSurface, SECTION_GROUP_KEYS, type SectionGroupKey } from "../../features/site/sectionGroups";
import { autoFitSections, autoFitRegions } from "./autoMobile";
import { applyCanvasAction, applyPageStyle, buildPreviewState, deliverPreviewState, findSectionOwner, moveBlockTo, moveSectionTo, PAGE_STYLE_GROUPS, PREVIEW_CHANNEL, previewRoute, samePreviewPage, sectionEntries, updateSectionsById, withDraftPage, writeSections } from "./studioWorkflow";
import { sectionStyleFields, SPACING_CARD_KEYS } from "./sectionStyleSchema";
import type { OutlineActions } from "./StudioOutline";
import { useStudioPersistence } from "./useStudioPersistence";
import { friendlyError } from "./friendlyError";
import { toastDuration } from "./toastTiming";
import { ActionMenu, Dialog, PrimaryButton, SecondaryButton, useConfirm, usePrompt } from "../riso/components";
import { applyInlineText, INLINE_STYLE_KEYS } from "./inlineText";
import { filterSettingGroups } from "./studioNavigation";
import { designChecks as buildDesignChecks, designSize } from "./studioChecks";
import { CATEGORY_PAGES, EXTRA_STYLE_CATEGORIES, SHOP_MAP, textSubsectionsFor, TEXT_BLURBS, TEXT_HEADINGS, THEME_HEADINGS, blurbFor, changedCopyCount, changedCounts, changedFields, defaultFor, isChanged, subsectionsFor } from "./settingsMap";
import { CategoryHeader, PreviewClickHint, SettingsHome, SettingsSubsection, StudioTips, type HomeHeading } from "./StudioSettingsHome";

import { saveSavedThemes, type Workspace } from "../themeStore";
import { writeDesignValue } from "../../features/site/designModel";
import { StudioPageOverrides, fieldPageOverride, shown as shownValue } from "./StudioPageOverrides";
import { fineTuneConflict } from "./fineTuneConflicts";
import { Group as PanelGroup, Panel, Separator, useDefaultLayout, type LayoutStorage } from "react-resizable-panels";
import { StudioRail } from "./StudioRail";
import { MediaPickerDialog, StudioMediaPanel, useMediaLibrary } from "./StudioMedia";
import { StudioHistory, versionName, type ThemeVersion } from "./StudioHistory";
import { HealthFindings, StudioHealth } from "./StudioHealth";
import { SiteHealthPanel, useSiteHealth } from "./StudioSiteHealth";
import { healthRoutes, loadSiteHistory, saveSiteHistory, siteHistoryKey, type HealthRoute, type SiteFinding } from "./siteHealth";
import { StudioWorkbench, type ChangeRow, type WorkbenchTab } from "./StudioWorkbench";
import { setupChecklist, type SetupItem } from "./setupChecklist";
import { StudioBreadcrumb } from "./StudioBreadcrumb";
import { describePlace, EMPTY_PLACES, goBack, normalizePlace, peekBack, placeCrumbs, placeKey, settlePlace, visitPlace, type Place, type PlaceHistory, type PlaceLabels } from "./placeHistory";
import { StudioThemes } from "./StudioThemes";
import { StudioSchedule } from "./StudioSchedule";
import { POLICY_KEYS, policySlug } from "../../features/site/policyPages";
import { auditDocument, summarise, type HealthFinding } from "./healthAudit";
import { categoryOptions } from "./pickers";
import { diffDesigns, restoreItem, summariseDiff, type DiffContext, type DiffItem } from "./designDiff";
import { MediaLibraryButton, MediaPickerContext } from "./mediaPicker";
import type { UsagePlace } from "./mediaLibrary";
import { GO_SEQUENCE_MS, resolveGoKey, resolveShortcut, SHORTCUTS, type ShortcutAction } from "./shortcuts";
import { StudioPreviewFrame } from "./StudioPreviewFrame";
import { TemplatePicker } from "./TemplatePicker";
import { currentOption, pickerOptions, type PickerOption } from "./templatePicker";
import { loadUiState, saveUiState, uiStateKey, type Zoom } from "./studioUiState";
import { auth } from "../../../lib/firebase";
import type { StudioLocation } from "../../lib/studioLocation";
import { LinkPicker, StudioPickerProvider } from "./StudioPickers";
import { StudioSectionLibrary } from "./StudioSectionLibrary";
import { StudioAiContext, type StudioAiValue } from "./StudioAiRewrite";
import { StudioBlockPicker } from "./StudioBlockPicker";
import { StudioBrandKit } from "./StudioBrandKit";
import { brandKitDesign, type BrandKitChoice } from "./brandKit";
import { BLOCK_CANDIDATE_ID, blockChoices, canPasteBlock, copyBlock, fitsAfter, pasteBlock, withBlockCandidate, type BlockChoice, type BlockClip } from "./blockLibrary";
import { StudioTemplateCard } from "./StudioTemplateCard";
import { isProductTemplate, StudioProductBlocks } from "./StudioProductBlocks";
import { ALT_BASE_LABELS, ALT_BASES, alternatesFor, altSurface, bookTemplateSurface, categoryTemplateSurface, createAlternate, deleteAlternate, isAltSurface, parseAltSurface, renameAlternate, type AltBase } from "../../features/site/templateAlternates";
import { DynamicSourcesContext } from "./StudioConnect";
import type { BookFieldDef } from "../../features/site/bookFields";
import { hasTokens, isDynamic } from "../../features/site/dynamicSources";
// Connected text (a $dyn value or {{tokens}}) opens the inspector instead of being typed over in the preview.
const isConnectedValue = (v: any) => isDynamic(v) || hasTokens(v);
import { CANDIDATE_ID, deletePreset, deleteSharedBlock, renamePreset, renameSharedBlock, withCandidate } from "./sectionLibrary";
import "./studio.css";

type LeftTab = "sections" | "style" | "text" | "menus" | "pages" | "media" | "themes";
/** `expect`: the design the toast's Undo belongs to (filled in once the change lands); see `undoAction`. */
type ToastAction = { label: string; run: () => void; expect?: { present?: any; past?: any[] } };
/** "ok" fades by itself (and waits while hovered or focused); "warn" and "err" stay until dismissed. */
type Toast = { kind: "ok" | "warn" | "err"; text: string; action?: ToastAction; id: number } | null;

function designChecks(design: any) {
  return buildDesignChecks(design, { sectionFields: getSectionFields, blockFields: getBlockFields, blocksKey: getBlocksKey });
}

/** React 19 renders `inert` from a boolean (an empty string now counts as off). */
const inertWhen = (on: boolean) => (on ? { inert: true } : {});

const DEVICE_W = { desktop: "1200px", tablet: "820px", mobile: "390px" } as const;

const SETTING_LABELS = new Map<string, string>([
  ...STYLE_GROUPS.flatMap(g => g.fields.map(f => [f.key, f.label] as [string, string])),
  ...COPY_SCHEMA.flatMap(g => g.fields.map(f => [`copy.${f.key}`, `“${f.label}” text`] as [string, string])),
]);
/** Plain name of a setting for undo labels: "Change Accent colour". */
const settingLabel = (path: string) => SETTING_LABELS.get(path) || SETTING_LABELS.get(path.split(".").pop() || "") || path.replace(/^copy\./, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

/** "heroPage.sections" → "Home › sections" for the save-conflict dialog. */
function conflictLabel(path: string, templates: { id: string; label: string }[]) {
  const [top, ...rest] = path.split(".");
  if (top === "copy" && rest[0]) return `Text & labels › ${COPY_SCHEMA.flatMap(g => g.fields).find(f => f.key === rest[0])?.label || rest[0]}`;
  const page = templates.find(t => t.id === top)?.label;
  const name = (key: string) => key === "copy" ? "Text & labels" : key === "sections" ? "sections" : SETTING_LABELS.get(key) || key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return page ? [page, ...rest.map(name)].join(" › ") : [name(top), ...rest].join(" › ");
}
/** Pseudo-category id for the "What I've changed" list (Theme settings and Text & labels). */
const CHANGED_CATEGORY = "__changed";

// ── tiny shared UI bits ────────────────────────────────────────────────────
const btn =
  "inline-flex items-center gap-1.5 px-3 h-9 text-xs font-bold border border-neutral-300 rounded-lg bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed";
const btnPrimary =
  "inline-flex items-center gap-1.5 px-4 h-9 text-xs font-bold rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed";
const iconBtn =
  "inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-md text-neutral-600 hover:bg-neutral-200 disabled:opacity-30";

// Clicking a region in the preview (data-studio-target) focuses the matching panel here.
type StudioFocus = { id: string | null; nonce: number };
const FocusContext = createContext<StudioFocus>({ id: null, nonce: 0 });

function Group({ id, title, hint, children, open: initial = false }: { id?: string; title: string; hint?: string; children: any; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  const focus = useContext(FocusContext);
  useEffect(() => { setOpen(initial); }, [initial]);
  useEffect(() => { if (id && focus.id === id) setOpen(true); }, [id, focus]);
  return (
    <section className="border-b border-neutral-200" data-studio-panel={id}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold hover:bg-neutral-50">
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-4">
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

/** The selected block's name for the breadcrumb (same wording as the outline). */
function selectedBlockCrumb(section: Section, blockId: string) {
  const key = getBlocksKey(section.type);
  const blocks = (section.settings?.[key] || section.settings?.blocks || []) as any[];
  const block = findBlock(blocks, blockId);
  return { label: block ? blockLabel(block, blocks.indexOf(block), getSectionMeta(section.type)?.blockLabel) : "Block" };
}

function sectionTitle(s: Section) {
  const meta = getSectionMeta(s.type);
  const st = s.settings || {};
  const snippet = [st.title, st.heading, st.headline, st.text].find((v) => typeof v === "string" && v.trim());
  return { label: meta?.label || "Section", snippet: snippet ? String(snippet).slice(0, 40) : "" };
}

// ── Menu editor ────────────────────────────────────────────────────────────
/** Header links with sub-links: show them as a mega menu (each sub-link a column, its own sub-links
 *  underneath) with an optional featured picture card. Data shape: storeMenu.ts `mega` / `featured*`. */
function MegaMenuControls({ item, onChange }: { item: MenuItem; onChange: (n: MenuItem) => void }) {
  const set = (patch: Partial<MenuItem>) => {
    const next: any = { ...item, ...patch };
    for (const k of ["featuredImage", "featuredTitle", "featuredLink"]) if (!next[k]) delete next[k];
    if (!next.mega) delete next.mega;
    onChange(next);
  };
  return (
    <div className="studio-mega" data-studio-panel="menus:mega">
      <label className="text-xs flex gap-1 items-center">
        <input type="checkbox" checked={item.mega === true} onChange={e => set({ mega: e.target.checked })} />
        Show sub-links as a mega menu (columns)
      </label>
      {item.mega === true && (
        <div className="studio-mega-featured">
          <p className="studio-hint">Each sub-link becomes a column heading; its own sub-links are listed under it. Add a picture to show a featured card beside the columns.</p>
          <label className="studio-scheme-field">Featured picture (link to an image)
            <input value={item.featuredImage || ""} onChange={e => set({ featuredImage: e.target.value })} placeholder="https://…" />
          </label>
          <MediaLibraryButton fieldKey="featuredImage" label="Mega menu picture" onChange={url => set({ featuredImage: url })} />
          <label className="studio-scheme-field">Featured card title
            <input value={item.featuredTitle || ""} onChange={e => set({ featuredTitle: e.target.value })} />
          </label>
          <LinkPicker label="Featured card link" value={item.featuredLink || ""} onChange={v => set({ featuredLink: v })} />
        </div>
      )}
    </div>
  );
}

function MenuRow({ item, pages, footer = false, depth, onChange, onRemove, onRemoveChild, onMove }: {
  item: MenuItem; pages: any[]; footer?: boolean; depth: number; onChange: (n: MenuItem) => void; onRemove: () => void;
  onRemoveChild?: (children: MenuItem[], gone: MenuItem) => void; onMove: (d: number) => void;
}) {
  const kids = item.children || [];
  const setKids = (c: MenuItem[]) => onChange({ ...item, children: c });
  return (
    <div className={`border border-neutral-200 rounded-lg p-2 space-y-2 bg-white ${depth ? "ml-4" : ""}`}>
      <div className="flex items-center gap-1">
        <input value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} placeholder="Link text" aria-label="Link text"
          className="flex-1 min-w-0 border border-neutral-200 rounded-md px-2 h-8 text-xs" />
        <button className={iconBtn} onClick={() => onMove(-1)} aria-label="Move up"><ChevronUp size={14} /></button>
        <button className={iconBtn} onClick={() => onMove(1)} aria-label="Move down"><ChevronDown size={14} /></button>
        <button className={iconBtn} onClick={onRemove} aria-label="Remove link"><Trash2 size={14} /></button>
      </div>
      <div className="flex gap-1">
        <select value={item.type} onChange={(e) => onChange({ ...item, type: e.target.value as any, value: "" })}
          aria-label="Link type" className="border border-neutral-200 rounded-md h-8 text-xs px-1">
          {MENU_LINK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {item.type === "page" ? (
          <select value={item.value || ""} onChange={(e) => onChange({ ...item, value: e.target.value })}
            aria-label="Page" className="flex-1 min-w-0 border border-neutral-200 rounded-md h-8 text-xs px-1">
            <option value="">Choose page…</option>
            {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title || p.slug}</option>)}
          </select>
        ) : item.type !== "home" ? (
          <input value={item.value || ""} onChange={(e) => onChange({ ...item, value: e.target.value })}
            placeholder={item.type === "url" ? "https://… or /path" : "collection name"} aria-label="Link target"
            className="flex-1 min-w-0 border border-neutral-200 rounded-md px-2 h-8 text-xs" />
        ) : null}
      </div>
      {(() => {
        // A link with no words or nowhere to go still shows up and quietly opens the home page: say so here.
        const problem = !item.label?.trim() ? "Give this link some text, or remove it." :
          item.type === "page" && item.value && !pages.some(p => p.slug === item.value) ? "That page no longer exists (or its address changed). Choose a page." :
          item.type !== "home" && !String(item.value || "").trim() ? (item.type === "page" ? "Choose a page; until then this link opens the home page." : "Add where this link goes; until then it opens the home page.") : "";
        return problem ? <p role="status" className="text-[11px] font-bold text-red-700">⚠ {problem}</p> : null;
      })()}
      {footer && depth === 0 && <div className="flex items-center gap-2">
        <select aria-label="Footer link group" value={footerGroup(item)} onChange={e => onChange({ ...item, footerGroup: e.target.value as any })} className="flex-1 border border-neutral-200 rounded-md h-8 text-xs px-1">
          <option value="explore">Explore</option><option value="connect">Participate & connect</option>
        </select>
        <label className="text-xs flex gap-1"><input type="checkbox" checked={!item.hidden} onChange={e => onChange({ ...item, hidden: !e.target.checked })} />Show link</label>
      </div>}
      {!footer && depth === 0 && kids.length > 0 && <MegaMenuControls item={item} onChange={onChange} />}
      {depth === 0 && (
        <>
          {kids.map((k, i) => (
            <MenuRow key={k.id} item={k} pages={pages} depth={1}
              onChange={(n) => setKids(kids.map((x, j) => (j === i ? n : x)))}
              onRemove={() => onRemoveChild ? onRemoveChild(kids.filter((_, j) => j !== i), k) : setKids(kids.filter((_, j) => j !== i))}
              onMove={(d) => {
                const j = i + d;
                if (j < 0 || j >= kids.length) return;
                const c = [...kids]; [c[i], c[j]] = [c[j], c[i]]; setKids(c);
              }} />
          ))}
          <button className="text-xs font-bold text-blue-700 hover:underline" onClick={() => setKids([...kids, newMenuItem()])}>+ Add sub-link</button>
        </>
      )}
    </div>
  );
}

// ── Header bar order (categories + in-menu pages, one sequence) ────────────
function NavOrderPanel({ design, pages, onChange, onSecondaryChange }: { design: any; pages: any[]; onChange: (order: string[]) => void; onSecondaryChange: (keys: string[]) => void }) {
  const raw: any[] = Array.isArray(design.categories) ? design.categories : [...CATEGORIES];
  const cats = raw.map((c, i) => (typeof c === "string" ? { id: `cat-${i}`, name: c, description: "", showInNav: true } : c));
  const items = buildNavItems(cats, pages, design.navOrder);
  return (
    <div className="p-4 space-y-3 border-b border-neutral-200" data-studio-panel="menus:header-order">
      <div>
        <p className="text-sm font-bold">Header bar order</p>
        <p className="text-xs text-neutral-500">Keep shopping in the main bar and place submissions, history and open calls in publisher navigation. Use the arrows to order links; select the row for each page.</p>
      </div>
      {items.length === 0 && <p className="text-xs text-neutral-400">Nothing is set to show in the header yet.</p>}
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center gap-1 border border-neutral-200 rounded-lg px-2 py-1 bg-white">
          <span className="flex-1 min-w-0 truncate text-xs font-bold uppercase">{it.label}</span>
          {it.kind === "page" ? <select aria-label={`Navigation row for ${it.label}`} className="text-xs rounded border px-1 py-1" value={splitNavigation(items, design).secondary.some(item => item.key === it.key) ? "secondary" : "primary"} onChange={(event) => {
            const keys = splitNavigation(items, design).secondary.map(item => item.key).filter(key => key !== it.key);
            onSecondaryChange(event.target.value === "secondary" ? [...keys, it.key] : keys);
          }}><option value="primary">Main shopping bar</option><option value="secondary">Publisher navigation</option></select> : <span className="text-[10px] uppercase tracking-wider text-neutral-400">Category</span>}
          <button className={iconBtn} onClick={() => onChange(moveNavItem(items, i, -1))} disabled={i === 0} aria-label={`Move ${it.label} earlier`}><ChevronUp size={14} /></button>
          <button className={iconBtn} onClick={() => onChange(moveNavItem(items, i, 1))} disabled={i === items.length - 1} aria-label={`Move ${it.label} later`}><ChevronDown size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function MenusPanel({ design, settings, pages, onChange, onRemove }: {
  design: any; settings: any; pages: any[]; onChange: (menus: any) => void;
  /** Removing a link (and its sub-links) is its own undoable step, offered back in a toast. */
  onRemove: (menus: any, label: string) => void;
}) {
  const [which, setWhich] = useState<"header" | "footer">("header");
  const focus = useContext(FocusContext);
  useEffect(() => { if (focus.id === "menus:header" || focus.id === "menus:footer") setWhich(focus.id === "menus:footer" ? "footer" : "header"); }, [focus]);
  const menus = design.menus || {};
  const items: MenuItem[] = menus[which] || [];
  const set = (next: MenuItem[]) => onChange({ ...menus, [which]: next });
  const remove = (next: MenuItem[], gone: MenuItem) => onRemove({ ...menus, [which]: next }, gone.label?.trim() || "the link");
  return (
    <div className="p-4 space-y-3" data-studio-panel="menus:links">
      <div className="flex gap-1" role="tablist">
        {(["header", "footer"] as const).map((w) => (
          <button key={w} role="tab" aria-selected={which === w} onClick={() => setWhich(w)}
            className={`px-3 h-8 text-xs font-bold rounded-lg ${which === w ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}>
            {w === "header" ? "Header menu" : "Footer menu"}
          </button>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Leave empty to use the automatic menu built from your pages.</p>
      {which === "footer" && !items.length && <button className={btn} onClick={() => set(automaticFooterItems({ ...settings, design }, pages))}>Customize automatic footer links</button>}
      {items.map((it, i) => (
        <MenuRow key={it.id} item={it} pages={pages} footer={which === "footer"} depth={0}
          onChange={(n) => set(items.map((x, j) => (j === i ? n : x)))}
          onRemove={() => remove(items.filter((_, j) => j !== i), it)}
          onRemoveChild={(next, gone) => remove(items.map((x, j) => (j === i ? { ...x, children: next } : x)), gone)}
          onMove={(d) => {
            const j = i + d;
            if (j < 0 || j >= items.length) return;
            const c = [...items]; [c[i], c[j]] = [c[j], c[i]]; set(c);
          }} />
      ))}
      {/* An empty footer menu shows the automatic links: adding one keeps them and appends the new link. */}
      <button className={btn} onClick={() => set([...(which === "footer" && !items.length ? automaticFooterItems({ ...settings, design }, pages) : items), newMenuItem()])}><Plus size={14} /> Add link</button>
    </div>
  );
}

// ── Main editor ────────────────────────────────────────────────────────────
/** A Studio button that opens a settings panel must land on one. One whose panel never appears is a dead
 * button (the owner clicks and nothing happens): it is logged and recorded on `window.__studioDeadLinks`,
 * which the browser checks (scripts/studio-e2e.mjs) fail on. */
export function reportDeadStudioLink(target: string, panel: string) {
  console.error(`[studio] the button for "${target}" opened nothing (no panel "${panel}")`);
  const w = window as any;
  w.__studioDeadLinks = [...(w.__studioDeadLinks || []), target];
}


// Sizes are strings: react-resizable-panels v4 reads bare numbers as pixels.
// Panels keep v2's clipped overflow; each panel's own content scrolls.
const PANEL_STYLE = { overflow: "hidden" } as const;
// Blocked storage (private windows, previews) must never stop Studio from opening.
const PANEL_STORAGE: LayoutStorage = {
  getItem: (key) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  setItem: (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* not remembered */ } },
};

export function StudioEditor({ settings, onExit, onPersisted, appearance = "light", workspace: openedWorkspace, initialLocation }: {
  appearance?: "light" | "dark";
  /** Opened from a Studio link (#designer?…): start on that page/tool instead of where you left off. */
  initialLocation?: StudioLocation;
  settings: any;
  /** Private working copy opened by StudioWorkspace; without it Studio uses the legacy settings fields. */
  workspace?: Workspace;
  onExit: () => void;
  /** Called after a successful save so the dashboard's copy of settings stays fresh. */
  onPersisted?: (design: any, published: boolean) => void;
}) {
  const defaults = useMemo(() => adminApi.getDefaultSettings().design, []);
  const [workspace] = useState<Workspace>(() => openedWorkspace ?? { draft: settings?.draftDesign ?? settings?.design, rev: 0, savedThemes: settings?.savedThemes || [] });
  const [hist, setHist] = useState(() => initHistory(normalizeDesign(settings?.draftDesign ?? settings?.design, defaults)));
  const design = hist.present;
  // Search titles in Pages are measured in the draft's tab-title format (Text & labels › Site & sharing).
  const pageTitleFormat = useCallback((title: string) => getCopy(design, "siteTitleFormat", { title }), [design]);
  const [savedDraft, setSavedDraft] = useState<any>(design);
  const [published, setPublished] = useState<any>(() => normalizeDesign(settings?.design, defaults));
  /** The design that is live right now (settings/website). Fresh from the server, normalised like the rest. */
  const readPublished = useCallback(async () => normalizeDesign(await adminApi.getLiveDesign(), defaults), [defaults]);
  const [pages, setPages] = useState<any[]>([]);
  const [pageLoadError, setPageLoadError] = useState(false);
  const [pageBusy, setPageBusy] = useState(false);
  const [books, setBooks] = useState<any[]>([]);
  const booksRef = useRef(books); booksRef.current = books;
  // Link / book / category / page pickers search what Studio already loaded (StudioPickers.tsx).
  const pickerData = useMemo(() => ({ books, pages, categories: design?.categories || [] }), [books, pages, design?.categories]);
  // The page open in Studio › Pages with unsaved edits — shown in the preview only, never saved from here.
  const [draftPage, setDraftPage] = useState<any | null>(null);
  // Where you were last time (this browser): page, workspace, device, zoom.
  const uiKey = uiStateKey(import.meta.env.BASE_URL, auth.currentUser?.uid || "local-preview");
  const [remembered] = useState(() => ({ ...loadUiState(uiKey), ...(initialLocation || {}), ...(initialLocation?.templateId && !initialLocation.showGlobal ? { showGlobal: false } : {}) }));
  const [leftTab, setLeftTab] = useState<LeftTab>((remembered.leftTab as LeftTab) || "sections");
  const [templateId, setTemplateId] = useState(remembered.templateId || "heroPage");
  // Read by the preview message handler, which is not re-created on every page switch.
  const templateIdRef = useRef(templateId); templateIdRef.current = templateId;
  const [showGlobal, setShowGlobal] = useState(remembered.showGlobal === true);
  // Which shared section group Page layout edits while `showGlobal` (under the header, above the footer, pop-up).
  const [globalGroup, setGlobalGroup] = useState<SectionGroupKey>(isGroupSurface(remembered.globalGroup || "") ? remembered.globalGroup as SectionGroupKey : "globalSections");
  const [device, setDevice] = useState<keyof typeof DEVICE_W>(remembered.device || "desktop");
  const [zoom, setZoom] = useState<Zoom>(remembered.zoom ?? "fit");
  // Desktop preview screen (Laptop 1200 / Large laptop 1440 / Big monitor 1920). Widens by itself when
  // Content width or the shop header width wouldn't fit, so a wider column actually shows (previewWidth.ts).
  const [desktopWidth, setDesktopWidth] = useState<DesktopWidth>(isDesktopWidth(remembered.desktopWidth) ? remembered.desktopWidth : 1200);
  const canvasWidth = device === "desktop" ? desktopWidth : parseInt(DEVICE_W[device], 10);
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches);
  // Panel widths are remembered per browser (react-resizable-panels v4 format; "v1" was v2's).
  const panelLayout = useDefaultLayout({ id: "studio-panels-v2", storage: PANEL_STORAGE, onlySaveAfterUserInteractions: true });
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return;
    const update = () => setNarrow(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  // Add section › pointing at a card: that section type, shown in the preview only (never in the draft or history).
  const [candidate, setCandidate] = useState<string | null>(null);
  // A section the AI drafted (Add section › Draft with AI), shown on the page until it is added or dropped.
  const [draftCandidate, setDraftCandidate] = useState<Section | null>(null);
  const [aiDraftOpen, setAiDraftOpen] = useState(0);
  useEffect(() => { if (adding === null) { setCandidate(null); setDraftCandidate(null); } }, [adding]);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "browse">("edit");
  const [mobilePanel, setMobilePanel] = useState("preview");
  // First link click swallowed in Edit mode: tell the owner once per browser how to follow links (Browse mode).
  const [linkHint, setLinkHint] = useState(false);
  const linkHintShown = useRef(false);
  useEffect(() => { if (mode !== "edit") setLinkHint(false); }, [mode]);
  useEffect(() => { if (!linkHint) return; const t = setTimeout(() => setLinkHint(false), 12000); return () => clearTimeout(t); }, [linkHint]);
  const [styleCategory, setStyleCategory] = useState<string | null>(null);
  const [textCategory, setTextCategory] = useState<string | null>(null);
  // Field Find anything is jumping to, so its collapsed sub-section opens first.
  const [fieldFocus, setFieldFocus] = useState<{ key: string; nonce: number } | null>(null);
  const [tipsNonce, setTipsNonce] = useState(0);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  // Opening (or leaving) a category starts at its top; Find anything then scrolls to its field.
  // Each rail tab remembers how far it was scrolled; coming back through the rail puts the owner back there.
  const tabScroll = useRef<Record<string, number>>({});
  const restoreScrollFor = useRef<string | null>(null);
  useEffect(() => {
    const back = restoreScrollFor.current === leftTab ? tabScroll.current[leftTab] || 0 : 0;
    restoreScrollFor.current = null;
    sidebarScrollRef.current?.scrollTo?.({ top: back });
  }, [styleCategory, textCategory, leftTab]);
  const [styleSearch, setStyleSearch] = useState("");
  // Region clicked in the preview → a pinned "Editing: <label>" card with only that region's controls.
  const [styleFocus, setStyleFocus] = useState<{ id: string; label: string } | null>(null);
  const [focus, setFocus] = useState<StudioFocus>({ id: null, nonce: 0 });
  const [styleScope, setStyleScope] = useState<"all" | "page">("all");
  const [productSlug, setProductSlug] = useState(remembered.productSlug || "");
  const [collectionSlug, setCollectionSlug] = useState(remembered.collectionSlug || "publications");
  const [previewStatus, setPreviewStatus] = useState<"loading" | "ready" | "error">("loading");
  const [previewRevision, setPreviewRevision] = useState(0);
  const [versions, setVersions] = useState<ThemeVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPreview, setHistoryPreview] = useState<ThemeVersion | null>(null);
  // Studio › Themes › Preview: a whole theme shown in the canvas without touching the draft.
  const [themePreview, setThemePreview] = useState<{ id: string; label: string; design: any } | null>(null);
  // Theme actions › Schedule publishing (3.5); a saved theme can be pre-selected from Themes.
  const [schedule, setSchedule] = useState<{ themeId: string | null } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"publish" | "discard" | null>(null);
  const [checksOpen, setChecksOpen] = useState(false);
  // Flexible composition being arranged on the preview's grid (3.0 phase 3), or null.
  const [arrangeId, setArrangeId] = useState<string | null>(null);
  // Workbench (3.0 phase 1): docked under the preview on tablets and computers; remembered per browser.
  const [workbench, setWorkbench] = useState<{ open: boolean; tab: WorkbenchTab }>(() => ({ open: remembered.workbenchOpen === true, tab: remembered.workbenchTab || "setup" }));
  const [healthRun, setHealthRun] = useState(0);
  const [healthIssues, setHealthIssues] = useState<number | null>(null);
  const [phoneSeen, setPhoneSeen] = useState(remembered.phoneSeen === true);
  const [publishedNow, setPublishedNow] = useState(false);
  const [copiedSection, setCopiedSection] = useState<Section | null>(null);
  // Block library 3.0: the copied block, the section the block picker is adding to, and the block pointed at in it
  // (shown in the preview only, never in the draft or history).
  const [copiedBlock, setCopiedBlock] = useState<BlockClip | null>(null);
  // Brand kit (3.0 phase 6): the panel is open, and the choice it is showing on the canvas (preview only).
  const [brandKit, setBrandKit] = useState(false);
  const [brandChoice, setBrandChoice] = useState<BrandKitChoice | null>(null);
  useEffect(() => { if (!brandKit) setBrandChoice(null); }, [brandKit]);
  // Switching workspace closes the brand kit (and its preview); its choices are not saved until Apply.
  const brandTabRef = useRef<string | null>(null);
  const [blockPicker, setBlockPicker] = useState<string | null>(null);
  const [blockCandidate, setBlockCandidate] = useState<any>(null);
  const pickerWasOpen = useRef(false);
  useEffect(() => {
    if (blockPicker) { pickerWasOpen.current = true; return; }
    setBlockCandidate(null);
    if (!pickerWasOpen.current) return;
    pickerWasOpen.current = false;
    // The preview may still have the try-on block selected: point it back at the real selection.
    if (blockId === BLOCK_CANDIDATE_ID) setBlockId(null);
    try { iframeRef.current?.contentWindow?.postMessage({ type: "HIGHLIGHT_SECTION", instanceId: selectedId, blockId: blockId === BLOCK_CANDIDATE_ID ? null : blockId, scroll: false }, window.location.origin); } catch { /* ignore */ }
  }, [blockPicker]); // eslint-disable-line react-hooks/exhaustive-deps
  // A section's look (Style / Layout / Visibility settings) copied from the outline, to paste onto others.
  const [copiedStyle, setCopiedStyle] = useState<Record<string, any> | null>(null);
  // "Move to…" dialog: sections to another page, or a block to another section.
  const [moveDialog, setMoveDialog] = useState<null | { kind: "sections"; ids: string[] } | { kind: "block"; sectionId: string; blockId: string }>(null);
  const [moveDest, setMoveDest] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [openPage, setOpenPage] = useState<{ slug: string; nonce: number } | null>(null);
  const [fillSeoRequest, setFillSeoRequest] = useState(0);
  const canvasSelectionRef = useRef<{sectionId: string; blockId: string | null} | null>(null);
  const inlineEditingRef = useRef(false);
  const [inlineEditing, setInlineEditing] = useState<string | null>(null);
  // What the preview actually rendered (Header · Page · Footer · Pop-overs) and the part under the pointer.
  const [structure, setStructure] = useState<PageStructure | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  // A built-in part of the page (header, buy card, bag…) open in the inspector, instead of a section.
  const [selectedElement, setSelectedElement] = useState<ElementRef | null>(null);

  const [toast, setToast] = useState<Toast>(null);
  const [askConfirm, confirmNode] = useConfirm();
  const [askText, promptNode] = usePrompt();
  // Studio › Media (2.4): the image library, also behind every image field's "Choose from library".
  const mediaLib = useMediaLibrary();
  const [copyFilter, setCopyFilter] = useState("");
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(() => (Array.isArray(settings?.savedThemes) ? settings.savedThemes : []));
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const postPreview = (message: any) => { try { iframeRef.current?.contentWindow?.postMessage(message, window.location.origin); } catch { /* preview not ready */ } };
  const designRef = useRef(design);
  designRef.current = design;

  // Alternate book/collection templates (Studio 2.8) join the page list as "Book page · Poetry".
  const altTemplates = useMemo((): PageTemplateMeta[] => ALT_BASES.flatMap(base => alternatesFor(design, base).map(t => ({
    id: altSurface(base, t.id), label: `${ALT_BASE_LABELS[base]} · ${t.name}`,
    description: `The “${t.name}” ${ALT_BASE_LABELS[base].toLowerCase()} template.`, previewMode: (base === "productPage" ? "product" : "collection") as any,
  }))), [design.alternateTemplates]); // eslint-disable-line react-hooks/exhaustive-deps
  const templates = useMemo(() => [...buildPageTemplates(pages, { includeDrafts: true }), ...altTemplates], [pages, altTemplates]);
  const template = templates.find((t) => t.id === templateId) || templates[0];
  // Collection alternates bring sections only (their page styles follow the default collection page).
  useEffect(() => { if (parseAltSurface(template.id)?.base === "collectionPage") setStyleScope("all"); }, [template.id]);
  // "This page only" belongs to the page it was chosen on. However the canvas moves to another page (page picker,
  // a followed link, Pages › Show, a section on another page, the every-page group), Studio goes back to All pages and says so.
  const scopePageRef = useRef(`${template.id}|${showGlobal}`);
  const scopeNoteBySelfRef = useRef(false);
  useEffect(() => {
    const now = `${template.id}|${showGlobal}`;
    if (scopePageRef.current === now) return;
    scopePageRef.current = now;
    if (styleScope !== "page") return;
    setStyleScope("all");
    // Back says it in its own message (one toast slot): don't replace "Back to …" with this one.
    if (scopeNoteBySelfRef.current) { scopeNoteBySelfRef.current = false; return; }
    say("ok", "Back to All pages: changes now apply to every page.");
  }, [template.id, showGlobal]);
  const target: SectionTarget = showGlobal ? { kind: "global", group: globalGroup } : { kind: "template", id: template.id };
  const sections = getSections(design, target);
  const selected = sections.find((s) => s.id === selectedId) || null;
  useEffect(() => {
    if (!selected) { setBlockId(null); return; }
    const blocks = selected.settings[getBlocksKey(selected.type)] || selected.settings.blocks || [];
    if (blockId && !findBlock(blocks, blockId)) setBlockId(null);
  }, [selected, blockId]);
  const colorSchemes = design.colorSchemes?.length ? design.colorSchemes : DEFAULT_COLOR_SCHEMES;
  const surfaceIds = useMemo(
    () => [...STATIC_SURFACES, ...templates.filter((t) => t.pageSlug || isAltSurface(t.id)).map((t) => t.id)],
    [templates],
  );
  const dirtyDraft = useMemo(() => !sameDesign(design, savedDraft), [design, savedDraft]);
  const unpublished = useMemo(() => !sameDesign(design, published), [design, published]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastSeq = useRef(0);
  // While the pointer or keyboard focus is on the message it is being read: no timer runs (a new message arriving
  // under the pointer waits too); the timer starts when both have left.
  const toastHeld = useRef({ hover: false, focus: false });
  const armToast = (id: number, ms: number) => {
    clearTimeout(toastTimer.current);
    if (toastHeld.current.hover || toastHeld.current.focus) return;
    toastTimer.current = setTimeout(() => setToast(t => (t?.id === id ? null : t)), ms);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  // A closed message can't send mouseleave/blur: forget the hold so the next message times out normally.
  useEffect(() => { if (!toast) toastHeld.current = { hover: false, focus: false }; }, [toast]);
  const say = (kind: "ok" | "warn" | "err", text: string, action?: ToastAction) => {
    const id = ++toastSeq.current;
    setToast({ kind, text, action, id });
    clearTimeout(toastTimer.current);
    if (kind === "ok") armToast(id, toastDuration(text, Boolean(action)));
  };
  const histRef = useRef(hist); histRef.current = hist;
  /** A toast's "Undo" undoes exactly the change the toast names: call it right after that `change(…)`. It records the
   *  design the change produced; if anything else has changed since (another edit, Undo/Redo), it refuses and points
   *  the owner at step-by-step Undo instead of undoing a different change. */
  const undoAction = (): ToastAction => {
    const expect: { present?: any; past?: any[] } = {};
    // Queued after the change's own update, so it sees the design that change produced.
    setHist(h => { expect.present = h.present; expect.past = h.past; return h; });
    return {
      label: "Undo", expect,
      run: () => {
        const h = histRef.current;
        // The same step may have absorbed a follow-up edit of the same field (coalescing keeps `past` as it was), e.g. the
        // rich-text editor rewriting the HTML into its own form: that is still the change this toast names.
        if (expect.present === undefined || !h.past.length || (h.present !== expect.present && h.past !== expect.past)) {
          say("err", "That change is no longer the latest one. Use Undo (Ctrl+Z) step by step, or Theme actions › Version history.");
          return;
        }
        setHist(cur => cur.present === expect.present ? undo(cur) : cur);
      },
    };
  };
  /** Toolbar / shortcut / Find Undo and Redo: a toast's Undo would no longer name the latest change, so it goes. */
  const stepHistory = (dir: "undo" | "redo") => {
    setHist(dir === "undo" ? undo : redo);
    setToast(t => t?.action?.expect ? null : t);
  };

  // Studio AI writing (3.0 phase 8): a rewrite lands through the field's own onChange, then this adds the toast.
  const aiNotifyRef = useRef<StudioAiValue["notify"]>(() => {});
  aiNotifyRef.current = (kind, text, opts) => {
    if (kind === "ok" && typeof opts?.undo === "function") { say("ok", text, { label: "Undo", run: opts.undo }); return; }
    if (kind === "ok" && opts?.undo) { say("ok", text, undoAction()); return; }
    if (opts?.needsKey) { say("err", text, { label: "Open AI settings", run: () => window.open(`${window.location.pathname}${window.location.search}#settings/general`, "_blank", "noopener") }); return; }
    say(kind, text);
  };
  const aiSiteName = getCopy(design, "siteName");
  const aiValue = useMemo<StudioAiValue>(() => ({ notify: (...args) => aiNotifyRef.current(...args), siteName: aiSiteName }), [aiSiteName]);

  // load pages + books for the preview pickers
  const loadPages = useCallback(async () => {
    setPageLoadError(false);
    try { setPages(await adminApi.getPages() || []); }
    catch { setPageLoadError(true); say("err", "Could not load pages for Studio preview. Check your connection and retry."); }
  }, []);
  useEffect(() => {
    loadPages();
    adminApi.getCategoryBooks().then((b: any[]) => { // Same collision-safe routes as the storefront (missing or shared slugs use the book id).
    const published = resolveProductRoutes((b || []).filter(x => x.status === "published" || !x.status)); setBooks(published); setProductSlug(current => published.some(x => x.slug === current) ? current : published[0]?.slug || ""); }).catch(() => say("err", "Could not load preview products. Reopen Studio to retry."));
  }, [loadPages]);
  // Media's delete guard reads the retained versions itself (they may not be loaded in History yet).
  // Custom book fields (Books › Book fields) — offered by "Connect to a detail" in the inspector.
  const [bookFields, setBookFields] = useState<BookFieldDef[]>([]);
  useEffect(() => {
    let live = true;
    Promise.resolve(adminApi.getBookFields?.()).then(list => { if (live && Array.isArray(list)) setBookFields(list); }).catch(() => { /* none yet: built-in details still connect */ });
    return () => { live = false; };
  }, []);
  const dynamicSourcesValue = useMemo(() => ({ fields: bookFields }), [bookFields]);
  const fetchVersions = useCallback(() => adminApi.listThemeVersions() as Promise<ThemeVersion[]>, []);
  const fetchStoredDesigns = useCallback(() => adminApi.listStoredDesigns(), []);
  // Version history (3.1) and the Publish / Discard dialogs describe differences in Studio's own words.
  const diffContext = useMemo((): DiffContext => ({
    templates, sectionName: (type: string) => getSectionMeta(type)?.label, sectionFields: (type: string) => getSectionFields(type),
  }), [templates]);
  const normalizeForDiff = useCallback((d: any) => normalizeDesign(d, defaults), [defaults]);
  /** The Publish / Discard lists: how many changes there are, and one line each (the first few). */
  const publishSummary = (from: any, to: any) => {
    const items = diffDesigns(normalizeForDiff(from), normalizeForDiff(to), diffContext);
    return { count: items.length, lines: summariseDiff(items) };
  };
  const loadVersions = useCallback(async () => {
    try { setVersions(await adminApi.listThemeVersions() as ThemeVersion[]); }
    catch { say("err", "Could not load version history. Check your connection and try again."); }
  }, []);

  // Every edit is one undo step with a name ("Undo: Move Newsletter up"); typing in one field merges.
  const change = useCallback((fn: (d: any) => any, meta?: { label?: string; coalesce?: string }) =>
    setHist((h) => { const next = normalizeDesign(fn(h.present), defaults); return sameDesign(next, h.present) ? h : commit(h, next, meta); }), [defaults]);
  const setList = (fn: (l: Section[]) => Section[], meta?: { label?: string; coalesce?: string }) => change((d) => setSections(d, target, fn(getSections(d, target))), meta);
  // Adding to a custom page makes its fixed title/text a movable Page content section first (see withPageText).
  const keepPageText = (l: Section[]) => target.kind === "template" ? withPageText(l, target.id, getSectionMeta("PageContentSection")?.defaults || {}) : l;
  // A named one-off action (a block move) gets its own undo step; typing merges into one.
  const patchSelected = (patch: Record<string, any>, meta?: { label: string }) => selectedId && setList((l) => patchSectionSettings(l, selectedId, patch),
    meta ? { label: meta.label } : { label: `Edit ${selected ? sectionTitle(selected).label : "section"}`, coalesce: `patch:${selectedId}:${Object.keys(patch).sort().join(",")}` });
  const saveSharedBlock = (id: string, name: string) => {
    if (!selected) return;
    const key = getBlocksKey(selected.type), blocks = selected.settings[key] || selected.settings.blocks || [];
    const source = findBlock(blocks, id); if (!source) return;
    const shared: SharedBlock = { id: newId(), name, sectionType: selected.type, block: { ...JSON.parse(JSON.stringify(source)), sharedBlockId: undefined }, updatedAt: new Date().toISOString() };
    change(d => {
      const nextSections = patchSectionSettings(getSections(d, target), selected.id, { [key]: mapBlock(blocks, id, b => ({ id: b.id, sharedBlockId: shared.id, grid: b.grid, responsive: b.responsive })) });
      return setSections({ ...d, sharedBlocks: [...(d.sharedBlocks || []), shared] }, target, nextSections);
    });
    say("ok", `“${name}” is now linked and reusable.`);
  };
  const insertSharedBlock = (shared: SharedBlock) => {
    if (!selected) return;
    const key = getBlocksKey(selected.type);
    patchSelected({ [key]: [...(selected.settings[key] || selected.settings.blocks || []), { id: newId(), sharedBlockId: shared.id }] });
    say("ok", `Linked “${shared.name}” to this section.`);
  };
  const patchSharedBlock = (sharedId: string, patch: Record<string, any>) => change(d => ({
    ...d,
    sharedBlocks: (d.sharedBlocks || []).map((shared: SharedBlock) => shared.id === sharedId
      ? { ...shared, block: { ...shared.block, ...patch }, updatedAt: new Date().toISOString() } : shared),
  }));
  const setStyle = (path: string, value: any) => change((d) => applyGlobalStyle(d, path, value, surfaceIds), { label: `Change ${settingLabel(path)}`, coalesce: `style:${path}` });
  /** Text & labels edits; Reset to default offers Undo, which puts the owner's own wording back. */
  const setCopy = (key: string, value: string | undefined) => {
    const prev = designRef.current.copy?.[key];
    setStyle('copy.' + key, value);
    if (value === undefined && typeof prev === "string") say("ok", "Label reset to default.", { label: "Undo", run: () => setStyle('copy.' + key, prev) });
  };
  const applyNoirLook = () => {
    change((d) => applyThemeKeysToSurfaces(d, { ...RISO_NOIR_TOKENS, themeLibraryPreset: RISO_NOIR_ID }, surfaceIds), { label: "Apply Riso Noir look" });
    say("ok", "Riso Noir applied to the draft — Publish to make it live.", undoAction());
  };
  const installNoirHome = () => {
    const tpl = HOME_LAYOUT_TEMPLATES.find((t) => t.id === RISO_NOIR_ID);
    if (!tpl) return;
    change((d) => setSections(d, { kind: "template", id: "heroPage" }, tpl.sections.map((s) =>
      makeSection(s.type, { ...(getSectionMeta(s.type)?.defaults || {}), ...(s.settings || {}) }))), { label: "Install Riso Noir home layout" });
    setTemplateId("heroPage");
    setShowGlobal(false);
    say("ok", "Noir homepage layout installed on the draft.", undoAction());
  };
  // Brand kit (3.0 phase 6): open the panel beside the preview; Apply writes every choice as one undoable change.
  const openBrandKit = () => {
    setAdding(null); setBlockPicker(null); setThemePreview(null); setHistoryPreview(null);
    setMobilePanel("outline"); setBrandKit(true);
  };
  const applyBrandKit = (choice: BrandKitChoice) => {
    setBrandKit(false);
    change((d) => brandKitDesign(d, choice, getSectionMeta), { label: "Apply brand kit" });
    if (choice.home === "starter") { setTemplateId("heroPage"); setShowGlobal(false); }
    say("ok", "Brand kit applied to the draft — Publish to make it live.", undoAction());
  };
  const applyLibraryTheme = (theme: any) => {
    const palette = PALETTES.find((p: any) => p.id === theme.palettePreset);
    const base: Record<string, any> = {
      ...(palette ? { palettePreset: palette.id, primaryColor: palette.accent, backgroundColor: palette.bg, textColor: palette.text } : {}),
      themeStyle: "default",
    };
    for (const k of THEME_APPLIED_KEYS) if (theme[k] !== undefined) base[k] = theme[k];
    change((d) => applyThemeKeysToSurfaces(d, { ...base, ...(theme.global || {}), themeLibraryPreset: theme.id }, surfaceIds), { label: `Apply “${theme.name}” look` });
    say("ok", `“${theme.name}” applied to the draft (sections and text kept) — Publish to make it live.`, undoAction());
  };
  // One My themes write at a time: a double-click on Duplicate would otherwise save from a stale list and leave an orphan copy.
  const themesBusyRef = useRef(false);
  const persistThemes = async (next: SavedTheme[], okText: string) => {
    if (themesBusyRef.current) { say("err", "Still saving My themes — try again in a moment."); return; }
    themesBusyRef.current = true;
    try { await saveSavedThemes(workspace, savedThemes, next); setSavedThemes(next); say("ok", okText); }
    catch (err: any) { say("err", friendlyError(err, "save your themes")); }
    finally { themesBusyRef.current = false; }
  };
  /** Saving or renaming onto another theme's name replaces that theme: ask first. */
  const confirmThemeName = async (name: string, exceptId?: string) => {
    const other = themeNamed(savedThemes, name, exceptId);
    return !other || askConfirm({ title: "Replace saved theme?", message: `“${other.name}” is already in My themes and will be replaced. This can't be undone.`, confirmLabel: "Replace theme" });
  };
  /** Adds a theme unless My themes is full (adding would silently drop the oldest one). */
  const addTheme = async (name: string, design: any, okText: string) => {
    const problem = savedThemeLimitProblem(savedThemes, name);
    if (problem) { say("err", problem); return; }
    if (!(await confirmThemeName(name))) return;
    await persistThemes(addSavedTheme(savedThemes, name, design), okText);
  };
  const saveCurrentAsTheme = async () => {
    const name = await askText({ title: "Save to My themes", label: "Theme name (it saves the whole design: style, text, menus and sections)", confirmLabel: "Save theme" });
    if (name === null) return;
    await addTheme(name, designRef.current, `Saved “${name.trim() || "Untitled theme"}” to My themes.`);
  };
  const duplicateTheme = (t: SavedTheme) => {
    const next = duplicateSavedTheme(savedThemes, t.id);
    const problem = next[0] && next[0].id !== savedThemes[0]?.id ? savedThemeLimitProblem(savedThemes, next[0].name) : null;
    if (problem) { say("err", problem); return; }
    void persistThemes(next, "Theme duplicated.");
  };
  const applySavedTheme = (t: SavedTheme) => {
    change(() => normalizeDesign(JSON.parse(JSON.stringify(t.design)), defaults), { label: `Load “${t.name}”` });
    say("ok", `“${t.name}” loaded into the draft — Publish to make it live.`, undoAction());
  };
  // Themes › Publish…: load the theme into the draft, then the usual Publish confirmation (with its summary).
  const publishSavedTheme = (t: SavedTheme) => {
    setThemePreview(null);
    applySavedTheme(t);
    setTimeout(() => setConfirmAction("publish"), 0);
  };
  useEffect(() => { if (leftTab !== "themes") setThemePreview(null); }, [leftTab]);
  useEffect(() => {
    if (brandTabRef.current !== null && brandTabRef.current !== leftTab) setBrandKit(false);
    brandTabRef.current = leftTab;
  }, [leftTab]);
  // A theme/version preview shows a different design in the canvas. Any edit to the draft (inspector,
  // canvas, undo, live sync) ends it, so the canvas never keeps showing the preview over a change.
  const previewedDesignRef = useRef(design);
  useEffect(() => {
    if (previewedDesignRef.current === design) return;
    previewedDesignRef.current = design;
    setThemePreview(null);
    setHistoryPreview(null);
  }, [design]);
  const renameTheme = async (t: SavedTheme) => {
    const name = await askText({ title: "Rename theme", label: "Theme name", defaultValue: t.name, confirmLabel: "Rename" });
    if (name === null || !name.trim()) return;
    if (!(await confirmThemeName(name, t.id))) return;
    persistThemes(renameSavedTheme(savedThemes, t.id, name), "Theme renamed.");
  };
  const exportTheme = (t: SavedTheme) => {
    const url = URL.createObjectURL(new Blob([serializeThemeFile(t)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = themeFileName(t); a.click();
    URL.revokeObjectURL(url);
  };
  const importTheme = async (file?: File | null) => {
    if (!file) return;
    const parsed = parseThemeFile(await file.text());
    if ("error" in parsed) { say("err", parsed.error); return; }
    await addTheme(parsed.name, parsed.design,
      parsed.strippedCustomCode?.length
        ? `Imported “${parsed.name}” into My themes without its custom code (${parsed.strippedCustomCode.join(", ")}). Add code yourself under Style › Custom code only if you trust it.`
        : `Imported “${parsed.name}” into My themes.`);
  };
  const riso = design.themeStyle === "riso";

  const setScopedStyle = (group: string, path: string, value: any) => {
    if (WIDTH_KEYS.has(path) && device === "desktop" && value != null) setDesktopWidth(w => screenForWidth(w, Number(value)));
    if (styleScope === "page" && PAGE_STYLE_GROUPS.has(group)) change(d => applyPageStyle(d, template.id, path, value));
    else setStyle(path, value);
  };

  const renderStyleField = (g: StyleGroup, field: StyleField) => {
    const f = schemeFieldOptions(field, colorSchemes);
    const local = styleScope === "page" && PAGE_STYLE_GROUPS.has(g.id);
    const region = REGION_GROUPS.find(group => group.id === g.id)?.regions.find(r => f.key.startsWith('regions.' + r.id));
    const values = { ...design.regions, ...(local ? design[template.id]?.regions : {}) };
    const own = readStyle(local ? design[template.id] : design, f.key);
    const suffix = region ? f.key.slice(('regions.' + regionKey(region.id, "", regionFieldDevice(f.key))).length) : "";
    const effective = region ? regionValue(values, region.id, suffix, regionFieldDevice(f.key))
      : (local ? readStyle(design[template.id], f.key) : undefined) ?? readStyle(design, f.key) ?? readStyle(defaults, f.key);
    const differs = !region && !local && isChanged(f, design, defaults);
    // All pages shows the shop-wide value; say so when the previewed page draws its own instead.
    const pageOwn = !region && !local && !showGlobal ? fieldPageOverride(design, template.id, f.key) : null;
    const tuned = region ? null : fineTuneConflict(design, f.key, "productPage");
    return (
      <div key={f.key} className="studio-field" data-style-key={f.key}>
        <SectionFieldEditor field={f as any} value={effective ?? f.defaultValue}
          onChange={v => setScopedStyle(g.id, f.key, v)}
          uploadFile={uploadStudioImage} />
        {(region || local) && <div className="studio-field-status">
          <small>{own != null && own !== "" ? "Custom value" : region ? "Same as the larger screen" : "Same as all pages"}</small>
          {own !== undefined && <button type="button" className="studio-reset" aria-label={`${local ? "Use the all-pages value" : "Use the larger screen's value"}: ${f.label}`}
            onClick={() => setScopedStyle(g.id, f.key, undefined)}>{local ? "Use the all-pages value" : "Use the larger screen's value"}</button>}
        </div>}
        {WIDTH_KEYS.has(f.key) && !design.fullWidth && <small className="studio-field-note" data-width-note>
          {device !== "desktop" ? `Phones and tablets always use their whole screen; switch the preview to Desktop to see this width.`
            : fillsScreen(desktopWidth, Number(effective ?? f.defaultValue)) ? `This width fills the ${desktopWidth}px preview screen. Pick a wider Screen width above the preview to see it.`
            : `Preview screen: ${desktopWidth}px wide. Smaller screens show the column at their own width.`}
        </small>}
        {pageOwn && <div className="studio-field-status" data-page-own>
          <small>{template.label} uses its own value: <b>{shownValue(pageOwn.value)}</b>. The preview shows that.</small>
          <button type="button" className="studio-reset" aria-label={`Use the all-pages value on ${template.label}: ${f.label}`}
            onClick={() => change(d => writeDesignValue(d, f.key, undefined, { surface: template.id }), { label: `Use the all-pages ${settingLabel(f.key)}` })}>Use the all-pages value</button>
        </div>}
        {tuned && <div className="studio-field-status" data-fine-tune-wins>
          <small>Fine-tune one element › <b>{tuned.label}</b> sets its own value ({shownValue(tuned.value)}), which is drawn instead of this.</small>
          <button type="button" className="studio-reset" aria-label={`Clear the ${tuned.label} element setting so ${f.label} applies`}
            onClick={() => change(d => tuned.paths.reduce((next, path) => applyGlobalStyle(next, path, undefined, surfaceIds), d), { label: `Clear ${tuned.label} element setting` })}>Use this control instead</button>
        </div>}
        {differs && <div className="studio-field-status">
          <small>Changed from default</small>
          <button type="button" className="studio-reset" aria-label={`Reset to default: ${f.label}`}
            onClick={() => setScopedStyle(g.id, f.key, defaultFor(f, defaults))}>Reset to default</button>
        </div>}
      </div>
    );
  };

  const openRegion = (id: string, label: string, previewDevice?: RegionDevice) => {
    if (previewDevice) setDevice(previewDevice);
    setStyleSearch(""); setStyleCategory(id); setStyleFocus({ id, label });
    setLeftTab("style"); setSelectedId(null); setBlockId(null);
  };
  const resetRegion = (group: string, id: string) => change(d => REGION_SUFFIXES.reduce((next, suffix) => {
    const path = 'regions.' + regionKey(id, suffix, device);
    return styleScope === "page" && PAGE_STYLE_GROUPS.has(group)
      ? applyPageStyle(next, template.id, path, undefined) : applyGlobalStyle(next, path, undefined, surfaceIds);
  }, d));

  // The shop's own categories (sub-categories as "Parent › Child"), for Preview collection.
  const previewCollections = useMemo(() => {
    const cats = normalizeCategories(Array.isArray(design.categories) ? design.categories : [...CATEGORIES]);
    return cats.filter((c: any) => c?.name).map((c: any) => {
      const parent = parentOf(c, cats);
      const parentName = parent ? cats.find((p: any) => p.id === parent)?.name : "";
      return { slug: slugify(c.name), label: parentName ? `${parentName} › ${c.name}` : c.name };
    });
  }, [design.categories]);

  const pickerList = useMemo(() => pickerOptions({ templates, books, collections: previewCollections }), [templates, books, previewCollections]);
  const pickerCurrent = currentOption(pickerList, { templateId: template.id, showGlobal, productSlug, collectionSlug });
  // Choosing a page keeps the current workspace (Theme settings stays open on the new page).
  const pickPage = (o: PickerOption) => {
    setSelectedId(null); setBlockId(null);
    if (o.global) { setShowGlobal(true); return; }
    setShowGlobal(false); setTemplateId(o.templateId);
    if (o.productSlug) setProductSlug(o.productSlug);
    if (o.collectionSlug) setCollectionSlug(o.collectionSlug);
  };
  useEffect(() => {
    saveUiState(uiKey, { leftTab, templateId, showGlobal, globalGroup, device, zoom, desktopWidth, productSlug, collectionSlug,
      workbenchOpen: workbench.open, workbenchTab: workbench.tab, ...(phoneSeen ? { phoneSeen } : {}) });
  }, [uiKey, leftTab, templateId, showGlobal, globalGroup, device, zoom, desktopWidth, productSlug, collectionSlug, workbench, phoneSeen]);
  useEffect(() => { if (device === "mobile") setPhoneSeen(true); }, [device]);

  // ── preview wiring ──
  // "Custom pages" (the shared page sections) previews the custom page last shown, not always the first one,
  // so selecting a shared section on "About" keeps the canvas on About.
  const [sharedPageSlug, setSharedPageSlug] = useState<string | null>(null);
  useEffect(() => { if (template.pageSlug) setSharedPageSlug(template.pageSlug); }, [template.pageSlug]);
  const previewUrl = useMemo(() => {
    const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
    const withQ = (p: string) => `${base}${p}${p.includes("?") ? "&" : "?"}preview=true`;
    switch (template.id) {
      case "storefront": return withQ("/?catalog=true");
      // "template=default" keeps the default layout even for a book or category that uses an alternate.
      case "productPage": return withQ(`/books/${productSlug || ""}?template=default`);
      case "collectionPage": return withQ(`/collections/${collectionSlug}?template=default`);
      case "cartPage": return withQ("/checkout");
      case "page404": return withQ("/studio-missing-page");
      case "wishlistPage": return withQ("/wishlist");
      case "accountPage": return withQ("/account");
      case "trackingPage": return withQ("/track");
      case "page": return withQ(`/page/${(sharedPageSlug && pages.some((p) => p.slug === sharedPageSlug) ? sharedPageSlug : pages.find((p) => p.status === "published")?.slug) || ""}`);
      default: {
        const alt = parseAltSurface(template.id);
        if (alt?.base === "productPage") return withQ(`/books/${productSlug || ""}?template=${alt.id}`);
        if (alt?.base === "collectionPage") return withQ(`/collections/${collectionSlug}?template=${alt.id}`);
        return withQ(template.pageSlug ? `/page/${template.pageSlug}` : "/");
      }
    }
  }, [template.id, template.pageSlug, productSlug, collectionSlug, pages, sharedPageSlug]);
  const previewUrlRef = useRef(previewUrl); previewUrlRef.current = previewUrl;

  // Full-screen "Preview in new tab" windows listen on this channel (features/site/previewTab.ts).
  const channelRef = useRef<BroadcastChannel | null>(null);
  const tabSeenRef = useRef(false);
  const draftStatusRef = useRef<"unsaved" | "draft" | "live">("live");
  draftStatusRef.current = dirtyDraft ? "unsaved" : unpublished ? "draft" : "live";
  const sendPreviewState = useCallback(() => {
    if (inlineEditingRef.current) return;
    const current = designRef.current;
    const candidateOwner = blockCandidate && blockPicker ? findSectionOwner(current, blockPicker) : null;
    const previewDesign = historyPreview?.design || themePreview?.design || ((candidate || draftCandidate) && adding !== null
      ? withCandidate(current, showGlobal ? globalGroup : template.id, getSections(current, target), adding, candidate ? makeSection(candidate, getSectionMeta(candidate)?.defaults || {}) : draftCandidate!)
      : candidateOwner ? withBlockCandidate(current, blockPicker!, getBlocksKey(candidateOwner.section.type), blockCandidate)
      : brandChoice ? brandKitDesign(current, brandChoice, getSectionMeta)
      : current);
    let state: ReturnType<typeof buildPreviewState>;
    try { state = buildPreviewState(settings, previewDesign, withDraftPage(pages, draftPage), books); }
    catch (err) { console.warn("[Studio] preview snapshot could not be built", err); return; }
    try {
      deliverPreviewState(iframeRef.current?.contentWindow, state, window.location.origin);
    } catch (err) { console.warn("[Studio] preview delivery failed", err); }
    // The View website tab shows the draft itself (never an Add-section try-out, a theme being previewed or a brand-kit
    // trial) plus whether it is saved, so its banner can say so. Built only once a tab has said hello.
    if (channelRef.current && tabSeenRef.current) {
      try {
        const tabState = previewDesign === current ? state : buildPreviewState(settings, current, withDraftPage(pages, draftPage), books);
        channelRef.current.postMessage({ ...tabState, studioStatus: draftStatusRef.current });
      } catch (err) { console.warn("[Studio] preview tab delivery failed", err); }
    }
  }, [historyPreview, themePreview, settings, pages, books, draftPage, candidate, draftCandidate, adding, blockCandidate, blockPicker, brandChoice, showGlobal, globalGroup, template.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sendPreviewRef = useRef(sendPreviewState);
  sendPreviewRef.current = sendPreviewState;
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(PREVIEW_CHANNEL);
    channelRef.current = bc;
    bc.onmessage = (e) => { if (e.data?.type === "PREVIEW_READY") { tabSeenRef.current = true; sendPreviewRef.current(); } };
    return () => { bc.close(); channelRef.current = null; };
  }, []);
  // View website shows the page as shoppers get it: no forced layout (?template=…), and Studio-only test pages
  // (the missing-page route, checkout with a sample bag, a book page with no book chosen) open the home page instead.
  const viewWebsiteUrl = useMemo(() => {
    const base = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
    const alt = parseAltSurface(template.id)?.base;
    const id = alt || template.id;
    const path = id === "productPage" && productSlug ? `/books/${productSlug}`
      : id === "collectionPage" && collectionSlug ? `/collections/${collectionSlug}`
      : id === "storefront" ? "/?catalog=true"
      : ["wishlistPage", "accountPage", "trackingPage"].includes(id) ? ({ wishlistPage: "/wishlist", accountPage: "/account", trackingPage: "/track" } as Record<string, string>)[id]
      : id === "page" || template.pageSlug ? (new URL(previewUrl).pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ""), "") || "/")
      : "/";
    return `${base}${path}${path.includes("?") ? "&" : "?"}preview=true`;
  }, [template.id, template.pageSlug, productSlug, collectionSlug, previewUrl]);
  const openPreviewTab = () => { window.open(viewWebsiteUrl, "_blank"); };
  // Saving or publishing changes what the View website tab's banner says, even when the design itself didn't change.
  useEffect(() => { if (tabSeenRef.current) sendPreviewRef.current(); }, [dirtyDraft, unpublished]);
  useEffect(() => { const t = setTimeout(sendPreviewState, 100); return () => clearTimeout(t); }, [design, sendPreviewState]);
  // Tell the preview which strings are editable copy, so double-clicking one jumps to its field.
  const sendCopyMap = useCallback(() => {
    const items = COPY_SCHEMA.flatMap((g) => g.fields.map((f) => ({ key: f.key, group: g.group, label: f.label, multiline: Boolean(f.multiline), editable: !/[{}]/.test(designRef.current.copy?.[f.key] ?? DEFAULT_COPY[f.key] ?? ""), text: (designRef.current.copy?.[f.key] ?? DEFAULT_COPY[f.key] ?? "") })));
    try { iframeRef.current?.contentWindow?.postMessage({ type: "SET_COPY_MAP", items }, window.location.origin); } catch { /* ignore */ }
    const editable: any[] = [];
    const canvas: any[] = [];
    const scanBlocks = (section: Section, blocks: any[], linked = false) => (blocks || []).forEach((block: any) => {
      for (const field of getBlockFields(section.type)) if (["text", "textarea", "html", "richtext"].includes(field.kind)) editable.push({ sectionId: section.id, blockId: block.id, shared: linked || Boolean(block.sharedBlockId), key: field.key, label: field.label, multiline: field.kind !== "text", format: ["html", "richtext"].includes(field.kind) ? "html" : undefined, editable: !isConnectedValue(block[field.key]) && (field.kind === "text" || field.kind === "textarea" || canInlineFormat(String(block[field.key] ?? "")) && ["html", "richtext"].includes(field.kind)), text: isDynamic(block[field.key]) ? "" : String(block[field.key] ?? "") });
      canvas.push({sectionId:section.id,blockId:block.id,actions:contextCapabilities(designRef.current, section.id, block.id, getBlocksKey),gaps:[],bounds:{}});
      scanBlocks(section, block.children || [], linked || Boolean(block.sharedBlockId));
    });
    // Every section list the preview can render, including the header (under the header) and pop-up groups,
    // so their canvas toolbar and double-click text work like any other section's.
    const targets: SectionTarget[] = [{ kind: "global" }, { kind: "global", group: "headerSections" }, { kind: "global", group: "overlaySections" }, ...templates.map(t => ({ kind: "template", id: t.id }) as SectionTarget)];
    for (const target of targets) for (const section of getSections(designRef.current, target)) {
      const gaps = getSectionFields(section.type).filter(f => GAP_KEYS.includes(f.key));
      canvas.push({sectionId:section.id,blockId:null,actions:contextCapabilities(designRef.current,section.id,undefined,getBlocksKey),addBlock:Boolean(getSectionMeta(section.type)?.blockType),gaps:gaps.map(f=>f.key),bounds:Object.fromEntries(gaps.map(f=>[f.key,fieldBounds(f)]))});
      for (const field of getSectionFields(section.type)) if (["text", "textarea", "html", "richtext"].includes(field.kind)) editable.push({ sectionId: section.id, blockId: null, key: field.key, label: field.label, multiline: field.kind !== "text", format: ["html", "richtext"].includes(field.kind) ? "html" : undefined, editable: !isConnectedValue(section.settings[field.key]) && (field.kind === "text" || field.kind === "textarea" || canInlineFormat(String(section.settings[field.key] ?? "")) && ["html", "richtext"].includes(field.kind)), text: isDynamic(section.settings[field.key]) ? "" : String(section.settings[field.key] ?? "") });
      scanBlocks(section, resolveSharedBlocks(section.settings[getBlocksKey(section.type)] || section.settings.blocks || [], designRef.current.sharedBlocks || []));
    }
    try { iframeRef.current?.contentWindow?.postMessage({ type: "SET_EDIT_MAP", items: editable }, window.location.origin); } catch { /* ignore */ }
    try { iframeRef.current?.contentWindow?.postMessage({ type: "SET_STYLE_TEXT_MAP", items: INLINE_STYLE_KEYS.map(key => ({ key, label: STYLE_GROUPS.flatMap(g => g.fields).find(f => f.key === key)?.label || key, multiline: key === "announcementText", editable: true })) }, window.location.origin); } catch { /* ignore */ }
    try { iframeRef.current?.contentWindow?.postMessage({type:"SET_CANVAS_MAP",items:canvas,device},window.location.origin); } catch { /* ignore */ }
  }, [templates, device]);
  // The edit map is a full scan of every section; run it only once typing/dragging settles, and when idle.
  useEffect(() => {
    let idle: number | undefined;
    const t = setTimeout(() => {
      const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
      if (ric) idle = ric(sendCopyMap, { timeout: 1000 }); else sendCopyMap();
    }, 600);
    return () => { clearTimeout(t); if (idle !== undefined) (window as any).cancelIdleCallback?.(idle); };
  }, [design, sendCopyMap]);

  const onIframeLoad = () => {
    inlineEditingRef.current = false; setInlineEditing(null);
    try {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) { setPreviewStatus("error"); return; }
      const s = doc.createElement("script");
      s.textContent = PREVIEW_BRIDGE_SOURCE;
      doc.head.appendChild(s);
    } catch { setPreviewStatus("error"); }
  };

  const highlight = useCallback((id: string | null, scroll = false, selectedBlock: string | null = blockId) => {
    try { iframeRef.current?.contentWindow?.postMessage({ type: "HIGHLIGHT_SECTION", instanceId: id, blockId: selectedBlock, scroll }, window.location.origin); } catch { /* ignore */ }
  }, [blockId]);
  // Add section: scroll the preview to the section being tried on the page.
  useEffect(() => {
    if (!candidate) return;
    const t = setTimeout(() => highlight(CANDIDATE_ID, true, null), 350);
    return () => clearTimeout(t);
  }, [candidate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Add block: scroll the preview to the block being tried in its section (marked "Preview · not added yet").
  useEffect(() => {
    if (!blockCandidate || !blockPicker) return;
    const t = setTimeout(() => highlight(blockPicker, true, BLOCK_CANDIDATE_ID), 350);
    return () => clearTimeout(t);
  }, [blockCandidate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Re-highlight right away when the selection changes, but only after edits settle when the design changes.
  useEffect(() => { canvasSelectionRef.current = null; highlight(selectedId); }, [selectedId, highlight]);
  useEffect(() => { if (selectedId) setSelectedElement(null); }, [selectedId]);
  useEffect(() => { const t = setTimeout(() => { const canvas = canvasSelectionRef.current; highlight(canvas?.sectionId || selectedId, false, canvas ? canvas.blockId : blockId); }, 250); return () => clearTimeout(t); }, [design]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { iframeRef.current?.contentWindow?.postMessage({ type: "STUDIO_MODE", mode }, window.location.origin); }, [mode]);
  // Arranging follows the selection: it stops when another section is chosen or Browse mode is on.
  useEffect(() => { if (arrangeId && (selectedId !== arrangeId || mode !== "edit")) setArrangeId(null); }, [selectedId, mode, arrangeId]);
  useEffect(() => {
    postPreview({ type: "GRID_ARRANGE", sectionId: arrangeId, device });
  }, [arrangeId, device, previewStatus, previewRevision]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new page in the preview: its structure is re-read, and a part selected on the old page closes.
  useEffect(() => { setStructure(null); setHoverKey(null); setSelectedElement(null); }, [previewUrl, previewRevision]);
  useEffect(() => { setPreviewStatus("loading"); const timer = setTimeout(() => setPreviewStatus(s => s === "loading" ? "error" : s), 15000); return () => clearTimeout(timer); }, [previewUrl, previewRevision]);

  // Open the settings behind a click-to-edit target (from the preview or the page structure).
  /** `keepElement`: called from the open part's own inspector ("Open in Theme settings"), so that part stays open. */
  const openTarget = (target: string, label = "", keepElement = false) => {
    const [kind, rest = ""] = target.split(":");
    const tab: LeftTab | null = kind === "style" ? "style" : kind === "copy" ? "text" : kind === "menus" ? "menus" : kind === "pages" ? "pages" : null;
    if (!tab) return;
    setMobilePanel("outline");
    setSelectedId(null); setBlockId(null);
    // A part opened earlier (in the inspector) is not what the owner asked for now: close it so the path and Back stay true.
    if (selectedElement && !keepElement) { setSelectedElement(null); postPreview({ type: "SELECT_NODE", key: null }); }
    if (tab === "style") { setStyleSearch(""); setStyleCategory(EXTRA_STYLE_CATEGORIES[rest] ? rest : null); }
    setStyleFocus(tab === "style" && STYLE_GROUPS.some(g => g.id === rest) ? { id: rest, label: label || (STYLE_GROUPS.find(g => g.id === rest)?.title || rest) } : null);
    if (tab === "text") { setCopyFilter(""); setTextCategory(rest); }
    setLeftTab(tab);
    const panel = kind === "menus" && (rest === "header" || rest === "footer") ? "menus:links" : tab === "style" && STYLE_GROUPS.some(g => g.id === rest) ? "style-focus" : target;
    setFocus(f => ({ id: target, nonce: f.nonce + 1 }));
    // The panel can mount a moment later (lazy tabs): look again before calling the button dead.
    const land = (tries: number) => setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-studio-panel="${CSS.escape(panel)}"]`);
      if (!el) { if (tries > 0) land(tries - 1); else reportDeadStudioLink(target, panel); return; }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("studio-flash");
      setTimeout(() => el.classList.remove("studio-flash"), 1600);
    }, tries === 6 ? 120 : 200);
    land(6);
  };
  // Page structure rows: a built-in region opens its own controls, anything else its click-to-edit settings.
  // Open a built-in part in the inspector (Words · Style · Layout · Visibility); the preview outlines it.
  const openElement = (el: ElementRef, scroll = false) => {
    setSelectedId(null); setBlockId(null); setSelectedElement(el); setMobilePanel("settings");
    postPreview({ type: "SELECT_NODE", key: el.key, scroll });
  };
  // ── Studio Health (3.3): audit the page the preview rendered ─────────────────────────────────
  /** Slugs that exist, so Health can spot links to missing books, pages and collections. */
  const healthKnown = () => ({
      books: new Set(books.flatMap((b: any) => [b.slug, b.id].filter(Boolean).map(String))),
      // Published custom pages, plus the shop policy pages (/page/policy-<key>; the footer only links the written ones).
      pages: new Set([
        ...pages.filter((p: any) => p.status === "published" || !p.status).map((p: any) => String(p.slug)),
        ...POLICY_KEYS.map(policySlug),
      ]),
      ...(Array.isArray(design.categories) && design.categories.length
        ? { collections: new Set(["publications", ...categoryOptions(design.categories).map(o => slugify(o.value))]) } : {}),
  });
  const runHealth = (): HealthFinding[] | null => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body || !doc.defaultView) return null;
    try { return auditDocument(doc, doc.defaultView, { device, base: import.meta.env.BASE_URL, known: healthKnown() }); }
    catch (err) { console.warn("[Studio] health check failed", err); return null; }
  };
  /** Opens a section wherever it lives (a page or a shared group), as clicking it in the preview does. */
  const openSectionAnywhere = (sectionId: string) => {
    const owner = findSectionOwner(designRef.current, sectionId);
    if (!owner) return false;
    if (isGroupSurface(owner.surface)) { setShowGlobal(true); setGlobalGroup(owner.surface); }
    else if (templates.some(t => t.id === owner.surface)) { setShowGlobal(false); setTemplateId(owner.surface); }
    else return false;
    setLeftTab("sections"); setSelectedElement(null); setSelectedId(sectionId); setBlockId(null); setMobilePanel("settings");
    postPreview({ type: "HIGHLIGHT_SECTION", instanceId: sectionId, blockId: null, scroll: true });
    return true;
  };
  const showFinding = (f: HealthFinding) => {
    const el = f.element as HTMLElement | null | undefined;
    if (!el || !el.isConnected) { say("err", "That part isn't on the page any more. Choose Check again."); return; }
    setChecksOpen(false);
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const previous = el.style.outline, offset = el.style.outlineOffset;
    el.style.outline = "3px solid #e8402a"; el.style.outlineOffset = "2px";
    setTimeout(() => { el.style.outline = previous; el.style.outlineOffset = offset; }, 2400);
    say("ok", `Showing: ${f.title}`, { label: "Back to Health", run: openHealth });
  };
  const fixFinding = (f: HealthFinding | SiteFinding) => {
    if (!f.owner) return;
    setChecksOpen(false);
    if (f.owner.sectionId && openSectionAnywhere(f.owner.sectionId)) return;
    openElement({ key: f.owner.key, label: f.owner.label || "This part", target: f.owner.target, region: f.owner.region || undefined }, true);
  };
  // Studio Health lives in the Workbench on larger screens and in its dialog on phones (no room for a dock there).
  const openHealth = () => {
    if (narrow) { setChecksOpen(true); return; }
    setWorkbench({ open: true, tab: "health" });
    setHealthRun(n => n + 1);
  };
  const openWorkbench = (tab: WorkbenchTab) => {
    if (narrow) { if (tab === "health") setChecksOpen(true); else say("ok", "The Workbench is shown on tablets and computers. Studio Health is in Theme actions."); return; }
    setWorkbench({ open: true, tab });
    if (tab === "health") setHealthRun(n => n + 1);
  };
  // ── Check every page (3.0 phase 7): each kind of shop page in a hidden preview, using the unsaved draft ──
  const siteHistoryStore = siteHistoryKey(import.meta.env.BASE_URL, auth.currentUser?.uid || "local-preview");
  const [siteHistory] = useState(() => loadSiteHistory(siteHistoryStore));
  const previewHref = (path: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}${path.includes("?") ? "&" : "?"}preview=true`;
  const site = useSiteHealth({
    routes: () => healthRoutes({ design: designRef.current, books, pages, policies: settings?.policies, collections: previewCollections }),
    snapshot: () => { try { return buildPreviewState(settings, designRef.current, withDraftPage(pages, draftPage), books); } catch { return null; } },
    urlFor: previewHref, device, width: canvasWidth,
    options: () => ({ base: import.meta.env.BASE_URL, known: healthKnown() }),
    history: siteHistory, onHistory: h => saveSiteHistory(siteHistoryStore, h),
  });
  // After "Open this page", check the page again once the canvas has loaded it (and open a part waiting for it).
  const afterOpenRef = useRef<{ element?: ElementRef } | null>(null);
  useEffect(() => {
    if (previewStatus !== "ready" || !afterOpenRef.current) return;
    const pending = afterOpenRef.current; afterOpenRef.current = null;
    const t = setTimeout(() => { setHealthRun(n => n + 1); if (pending.element) openElement(pending.element, true); }, 900);
    return () => clearTimeout(t);
  }, [previewStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Shows a checked page on the canvas; false (and a new tab) when Studio has no template for it (policy pages). */
  const openHealthPage = (r: HealthRoute, then?: ElementRef) => {
    const d = designRef.current;
    const route = previewRoute(previewHref(r.path), import.meta.env.BASE_URL, { showHero: d?.showHero !== false });
    if (!route) { window.open(previewHref(r.path), "_blank"); return false; }
    // A category opens in the layout it was checked in (its own alternate, as shoppers see it).
    let templateId = route.templateId;
    if (route.collection && templateId === "collectionPage") {
      const cat = normalizeCategories(Array.isArray(d?.categories) ? d.categories : []).find((c: any) => c?.name && slugify(c.name) === route.collection);
      if (cat) templateId = categoryTemplateSurface(d, cat);
    }
    if (!templates.some(t => t.id === templateId)) { window.open(previewHref(r.path), "_blank"); return false; }
    // Already on the canvas: nothing will reload, so act now (never leave a pending action for some later page).
    const here = !showGlobal && template.id === templateId && (!route.product || route.product === productSlug) && (!route.collection || route.collection === collectionSlug);
    if (here) { afterOpenRef.current = null; if (then) openElement(then, true); else setHealthRun(n => n + 1); setMobilePanel("preview"); return true; }
    afterOpenRef.current = { element: then };
    setShowGlobal(false); setSelectedId(null); setBlockId(null); setSelectedElement(null);
    setTemplateId(templateId);
    if (route.product) setProductSlug(route.product);
    if (route.collection) setCollectionSlug(route.collection);
    setMobilePanel("preview");
    return true;
  };
  // A part found on another page: a section opens wherever it lives; a built-in part needs its page on the canvas first.
  const fixSiteFinding = (f: SiteFinding, route?: HealthRoute) => {
    if (!f.owner) return;
    if (f.owner.sectionId && findSectionOwner(designRef.current, f.owner.sectionId)) { fixFinding(f); return; }
    const el: ElementRef = { key: f.owner.key, label: f.owner.label || "This part", target: f.owner.target, region: f.owner.region || undefined };
    setChecksOpen(false);
    if (route) openHealthPage(route, el); else openElement(el, true);
  };
  const runSiteHealth = () => { openHealth(); void site.start(); };
  const sitePanel = <SiteHealthPanel site={site} onOpenPage={r => { setChecksOpen(false); return openHealthPage(r); }} onFix={fixSiteFinding} />;
  // After a publish, the live design is what Health should describe: check again if its tab is showing.
  const publishedRef = useRef(published);
  useEffect(() => {
    if (publishedRef.current === published) return;
    publishedRef.current = published;
    setPublishedNow(true);
    if (workbench.open && workbench.tab === "health") setHealthRun(n => n + 1);
  }, [published]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Publish confirmation says how the page in the preview checks out.
  // null = not checked yet ("Checking the page…"); "failed" = the preview couldn't be checked.
  const [publishHealthState, setPublishHealthState] = useState<ReturnType<typeof summarise> | "failed" | null>(null);
  const publishHealth = publishHealthState === "failed" ? null : publishHealthState;
  useEffect(() => {
    if (confirmAction !== "publish") { setPublishHealthState(null); return; }
    const found = runHealth();
    setPublishHealthState(found ? summarise(found) : previewStatus === "loading" ? null : "failed");
  }, [confirmAction, previewStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const openStructureItem = (item: StructureItem) =>
    openElement({ key: item.key, label: item.label, target: item.target, region: item.region || undefined }, true);
  const closeElement = () => { setSelectedElement(null); postPreview({ type: "SELECT_NODE", key: null }); setMobilePanel("preview"); };
  // "Open in Theme settings" from the element inspector: the region's own controls, else its style category.
  const openElementInTheme = (el: ElementRef) => {
    const region = el.region && REGION_GROUPS.flatMap(g => g.regions).find(r => r.id === el.region);
    if (region) { openRegion(region.id, region.label); return; }
    const target = primaryTarget(el.target);
    if (target) openTarget(target, el.label, true);
  };
  const regionToggleState = (id: string) => {
    const region = REGION_GROUPS.flatMap(g => g.regions).find(r => r.id === id);
    if (!region) return null;
    const values = { ...design.regions, ...(design[template.id]?.regions || {}) };
    return { visible: regionValue(values, id, "Visible", device) !== false, required: Boolean(region.required) };
  };
  // Hides or shows a built-in part at the size being previewed, on every page (Undo restores it).
  const toggleRegion = (id: string, visible: boolean) => {
    const label = REGION_GROUPS.flatMap(g => g.regions).find(r => r.id === id)?.label || id;
    change(d => applyGlobalStyle(d, `regions.${regionKey(id, "Visible", device)}`, visible ? undefined : false, surfaceIds),
      { label: `${visible ? "Show" : "Hide"} ${label} on ${REGION_DEVICE_LABELS[device].toLowerCase()}` });
  };
  const renameSection = async (id: string) => {
    const section = sections.find(x => x.id === id); if (!section) return;
    const name = await askText({ title: "Rename section", label: "Name shown in Studio (shoppers never see it). Leave empty to use the section type.", defaultValue: section.label || "", confirmLabel: "Rename" });
    if (name === null) return;
    const label = name.trim().slice(0, 80);
    setList(list => list.map(x => {
      if (x.id !== id) return x;
      const { label: _old, ...rest } = x;
      return label ? { ...rest, label } : rest;
    }), { label: label ? `Rename section to ${label}` : "Clear section name" });
  };
  // Theme settings › "Show on page": open the page where a category's part appears, then select that
  // part in the inspector once the preview has reported its structure (opening a pop-over if needed).
  // Scans keep arriving while the page loads, so it waits up to 8s; if the part never shows (switched
  // off, or it needs content first) the category's own settings open instead of a dead end.
  const pendingShow = useRef<null | { group: string; overlayOpened: boolean; until: number; timer: number }>(null);
  const categoryTitle = (id: string) => EXTRA_STYLE_CATEGORIES[id]?.title || STYLE_GROUPS.find(g => g.id === id)?.title || id;
  const showOnPage = (groupId: string) => {
    const where = CATEGORY_PAGES[groupId]; if (!where) return;
    if (pendingShow.current) window.clearTimeout(pendingShow.current.timer);
    const request = { group: groupId, overlayOpened: false, until: Date.now() + 8000, timer: 0 };
    request.timer = window.setTimeout(() => {
      if (pendingShow.current !== request) return;
      pendingShow.current = null;
      setLeftTab("style"); setStyleCategory(groupId); setMobilePanel("outline");
      say("warn", `${categoryTitle(groupId)} isn't showing on this page right now — it may be switched off or need content first. Its settings are open instead.`);
    }, 8000);
    pendingShow.current = request;
    setStyleCategory(null); setStyleFocus(null); setSelectedId(null); setBlockId(null); setShowGlobal(false);
    setLeftTab("sections"); setMobilePanel("preview");
    // Already on a custom page counts as "a custom page"; otherwise switch, which reloads the preview.
    const next = where.template === "page" && template.id.startsWith("page:") ? template.id : where.template;
    if (next && next !== template.id) setTemplateId(next);
    else postPreview({ type: "SCAN_STRUCTURE" });
  };
  useEffect(() => () => { if (pendingShow.current) window.clearTimeout(pendingShow.current.timer); }, []);
  useEffect(() => {
    const want = pendingShow.current; if (!want || !structure) return;
    const all = (items: StructureItem[]): StructureItem[] => items.flatMap(i => [i, ...all(i.children)]);
    const found = all([...structure.header, ...structure.main, ...structure.footer, ...structure.overlay, ...structure.page])
      .find(i => i.target.split("|").includes(`style:${want.group}`));
    if (found) { window.clearTimeout(want.timer); pendingShow.current = null; openStructureItem(found); return; }
    const overlay = CATEGORY_PAGES[want.group]?.overlay;
    if (overlay && !want.overlayOpened) { want.overlayOpened = true; setMode("edit"); postPreview({ type: "OPEN_OVERLAY", overlay }); }
    // Otherwise keep waiting: the page may still be loading. The timer opens the settings if it never shows.
  }, [structure]); // eslint-disable-line react-hooks/exhaustive-deps
  // Editing the Pop-up group opens the pop-up in the preview (and closes it again on leaving).
  const editingPopup = showGlobal && globalGroup === "overlaySections";
  // Opening a Theme settings category for a pop-over (Cart drawer, Pop-up window) opens it in the preview too,
  // so its controls change something the owner can see; leaving the category closes it again.
  const categoryOverlay = leftTab === "style" && styleCategory ? CATEGORY_PAGES[styleCategory]?.overlay : undefined;
  useEffect(() => {
    if (previewStatus !== "ready") return;
    if (editingPopup) { postPreview({ type: "OPEN_OVERLAY", overlay: "popup" }); return; }
    if (categoryOverlay) { postPreview({ type: "OPEN_OVERLAY", overlay: categoryOverlay }); return; }
    postPreview({ type: "OPEN_OVERLAY", overlay: "close" });
  }, [editingPopup, categoryOverlay, previewStatus, previewUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  // preview → editor messages
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow || !e.data) return;
      const d = e.data;
      if (d.type === "PREVIEW_ERROR") say("err", `The preview hit an error: ${String(d.message).slice(0, 200)}`);
      if (d.type === "PREVIEW_READY") { setPreviewStatus("ready"); sendPreviewState(); sendCopyMap(); highlight(selectedId); iframeRef.current?.contentWindow?.postMessage({ type: "STUDIO_MODE", mode }, window.location.origin); }
      if (d.type === "STUDIO_ROUTE" && typeof d.href === "string") {
        const route = previewRoute(d.href, import.meta.env.BASE_URL, {
          showHero: designRef.current?.showHero !== false,
          bookTemplate: slug => bookTemplateSurface(designRef.current, booksRef.current.find(b => b.slug === slug || b.id === slug)),
        });
        // The preview reports its page on every load. The page Studio itself asked for is not a page change
        // (it keeps a chosen Home / Custom pages template); anything else (a link, a full-page load) is followed.
        const asked = samePreviewPage(d.href, previewUrlRef.current);
        // Only a real page change resets the selection: the preview also reports its route when it
        // finishes loading, which can arrive after the owner has already selected something.
        if (route && !asked && templates.some(t => t.id === route.templateId) && route.templateId !== templateIdRef.current) { setTemplateId(route.templateId); setShowGlobal(false); setSelectedId(null); setBlockId(null); }
        if (route?.product) setProductSlug(route.product);
        if (route?.collection) setCollectionSlug(route.collection);
        sendPreviewState();
      }
      if (d.type === "KEY_COMMAND" && typeof d.key === "string") {
        const action = resolveShortcut({ key: d.key, ctrl: !!d.ctrl, meta: !!d.meta, shift: !!d.shift, alt: !!d.alt });
        if (action) shortcutRef.current(action);
        return;
      }
      if ((d.type === "STUDIO_ELEMENT" || d.type === "ELEMENT_INFO") && typeof d.key === "string") {
        const el: ElementRef = { key: d.key, label: String(d.label || "").slice(0, 120), target: String(d.target || "").slice(0, 300),
          region: typeof d.region === "string" && d.region ? d.region.slice(0, 80) : undefined, text: String(d.text || "").slice(0, 2000) };
        if (d.type === "STUDIO_ELEMENT") { setSelectedId(null); setBlockId(null); setSelectedElement(el); setMobilePanel("settings"); }
        else setSelectedElement(cur => cur?.key === el.key ? { ...cur, ...el, label: cur.label || el.label } : cur);
        return;
      }
      if (d.type === "STRUCTURE") { const nodes = readStructure(d.nodes); if (nodes) setStructure(buildPageStructure(nodes)); return; }
      if (d.type === "LINK_BLOCKED") {
        if (linkHintShown.current) return;
        linkHintShown.current = true;
        try { if (localStorage.getItem("lm:studio-mode-hint")) return; localStorage.setItem("lm:studio-mode-hint", "1"); } catch { /* private window: hint shows once per visit */ }
        setLinkHint(true);
        return;
      }
      if (d.type === "NODE_HOVER") { setHoverKey(typeof d.key === "string" ? d.key : null); return; }
      if (d.type === "CANVAS_SELECT" && d.sectionId) canvasSelectionRef.current = {sectionId:d.sectionId,blockId:d.blockId || null};
      if (d.type === "SECTION_SELECT" && d.instanceId) {
        // Any section group (under the header, above the footer, pop-up) or page.
        const owner = findSectionOwner(designRef.current, d.instanceId);
        if (!owner) return;
        if (isGroupSurface(owner.surface)) { setShowGlobal(true); setGlobalGroup(owner.surface); }
        else if (templates.some(t => t.id === owner.surface)) { setShowGlobal(false); setTemplateId(owner.surface); }
        else return;
        setLeftTab("sections");
        setSelectedId(d.instanceId);
        setBlockId(typeof d.blockId === "string" ? d.blockId : null);
        setMobilePanel("settings");
      }
      if (d.type === "SECTION_MOVE" && d.sectionId && d.beforeId) {
        change(current => applyCanvasAction(current, d, getBlocksKey));
      }
      if (d.type === "BLOCK_MOVE_TO" && typeof d.fromSectionId === "string" && typeof d.toSectionId === "string" && typeof d.blockId === "string") {
        const result = moveBlockTo(designRef.current, { fromSectionId: d.fromSectionId, blockId: d.blockId, toSectionId: d.toSectionId, beforeId: typeof d.beforeId === "string" ? d.beforeId : null }, getBlocksKey);
        if (result.error) say("err", result.error);
        else { change(() => result.design, { label: "Move block to another section" }); setSelectedId(d.toSectionId); setBlockId(d.blockId); }
      }
      if (d.type === "BLOCK_MOVE" && d.sectionId && d.blockId && d.beforeId) {
        change(current => applyCanvasAction(current, d, getBlocksKey));
      }
      if (d.type === "INSERT_AT" && typeof d.sectionId === "string") {
        // Canvas toolbar › + Section above / below: open Add section at that spot.
        const owner = findSectionOwner(designRef.current, d.sectionId);
        if (!owner) return;
        if (isGroupSurface(owner.surface)) { setShowGlobal(true); setGlobalGroup(owner.surface); }
        else if (templates.some(t => t.id === owner.surface)) { setShowGlobal(false); setTemplateId(owner.surface); }
        else return;
        const index = owner.sections.findIndex(sec => sec.id === d.sectionId);
        setLeftTab("sections"); setSelectedId(null); setBlockId(null);
        setAdding(d.position === "before" ? Math.max(0, index) : index + 1);
        setMobilePanel("outline");
        return;
      }
      if (d.type === "ADD_BLOCK" && d.sectionId) {
        // Canvas toolbar › + Block opens the block picker for that section (Block library 3.0).
        const owner = findSectionOwner(designRef.current, d.sectionId);
        const meta = owner && getSectionMeta(owner.section.type); if (!owner || !meta?.blockType) return;
        openBlockPickerRef.current(d.sectionId);
      }
      if (d.type === "CONTEXT_ACTION" && typeof d.sectionId === "string") {
        change(current => applyContextAction(current, d, getBlocksKey));
        if (d.action === "delete" || d.action === "hide") { canvasSelectionRef.current = null; highlight(null,false,null); setSelectedId(null); setBlockId(null); }
        if (d.action === "delete") say("warn", d.blockId ? "Block deleted." : "Section deleted.", undoAction());
      }
      if ((d.type === "SPACING_COMMIT" || d.type === "SPACING_RESET") && typeof d.sectionId === "string") {
        change(current => {
          const owner = findSectionOwner(current,d.sectionId); if (!owner) return current;
          const gapFields = getSectionFields(owner.section.type).filter(f => GAP_KEYS.includes(f.key));
          const allowed = [...PADDING_KEYS,...gapFields.map(f => f.key)];
          if(d.type === "SPACING_RESET") return allowed.reduce((dd,key)=>applySpacing(dd,{...d,key,value:null},allowed),current);
          const field = gapFields.find(f => f.key === d.key);
          if(field && (d.value < fieldBounds(field).min || d.value > fieldBounds(field).max)) return current;
          return applySpacing(current,d,allowed);
        });
      }
      if (d.type === "GRID_PLACE" && typeof d.sectionId === "string" && typeof d.blockId === "string") {
        change(current => applyGridMessage(current, d, getBlocksKey, updateSectionsById), { label: d.by ? (d.by.dw || d.by.dh ? "Resize block on grid" : "Nudge block on grid") : "Place block on grid" });
      }
      if (d.type === "TEXT_EDIT_START") { inlineEditingRef.current = true; setInlineEditing(typeof d.label === "string" ? d.label : "Text"); }
      if (d.type === "TEXT_EDIT_END") {
        inlineEditingRef.current = false; setInlineEditing(null);
        setTimeout(() => sendPreviewRef.current(), 0);
      }
      if (d.type === "INLINE_TEXT_COMMIT") {
        const schema = {
          sectionFields: getSectionFields, blockFields: getBlockFields, blocksKey: getBlocksKey,
          copyKeys: COPY_SCHEMA.flatMap(g => g.fields.map(f => f.key)), styleKeys: INLINE_STYLE_KEYS,
          applyStyle: (dd: any, key: string, value: string) => applyGlobalStyle(dd, key, value, surfaceIds),
        };
        // The preview only sends changed text, so an unchanged draft means the edit was refused (the
        // part moved, or that field can't be typed here): say so instead of letting the words snap back.
        if (applyInlineText(designRef.current, d, schema) === designRef.current) say("err", "That text couldn't be changed in the preview. Click the part and edit it in the panel on the right.");
        else change(current => applyInlineText(current, d, schema));
      }
      if (d.type === "INLINE_TEXT_UNAVAILABLE") {
        if (d.sectionId) {
          const owner = findSectionOwner(designRef.current, d.sectionId);
          if (owner) { setShowGlobal(isGroupSurface(owner.surface)); if (isGroupSurface(owner.surface)) setGlobalGroup(owner.surface); else setTemplateId(owner.surface); }
          setLeftTab("sections"); setSelectedId(d.sectionId); setBlockId(d.blockId || null); setMobilePanel("settings");
        } else if (d.kind === "copy") {
          const openWords = () => { setCopyFilter(d.key || ""); if (d.key) setFieldFocus({ key: String(d.key), nonce: Date.now() }); setLeftTab("text"); setMobilePanel("outline"); };
          openWords();
          say("warn", "This text is built from a template; open Text & labels to change it.", { label: "Open Text & labels", run: openWords });
          return;
        }
        say("ok", "Formatted or templated text opens in the inspector so its structure is preserved.");
      }

    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [templates, selectedId, sendPreviewState, sendCopyMap, highlight, change, mode]);

  const { busy, lastSaved, liveSyncPaused, saveDraft, publish, discard, recovery, recover, dismissRecovery, conflict, resolveConflict, incoming, resolveIncoming } = useStudioPersistence({
    design, savedDraft, published, setSavedDraft, setPublished, onPersisted, workspace,
    reset: (next) => { setHist(initHistory(next)); setSelectedId(null); setBlockId(null); },
    restore: next => change(() => normalizeDesign(next, defaults)), say,
    normalize: next => normalizeDesign(next, defaults),
    readPublished,
  });
  // The status pill's hover text: what it means for the shop, and when this tab last saved.
  const statusTitle = [
    dirtyDraft ? "Your edits are only in this browser tab until you press Save draft. The shop is unchanged."
      : unpublished ? "Your draft is saved, but shoppers still see the older design until you press Publish."
      : "Shoppers see exactly this design.",
    lastSaved ? `${lastSaved.kind === "publish" ? "Published" : "Draft saved"} at ${new Date(lastSaved.at).toLocaleTimeString()}.` : "",
  ].filter(Boolean).join(" ");
  // Set when reading the live design fails: the Publish list is then compared with an older copy.
  const [liveCheckFailed, setLiveCheckFailed] = useState(false);
  const refreshPublished = (alive: () => boolean) => readPublished().then(
    fresh => { if (alive()) { setLiveCheckFailed(false); setPublished((prev: any) => (designEqual(prev, fresh) ? prev : fresh)); } },
    () => { if (alive()) setLiveCheckFailed(true); });
  // Studio opened from a long-lived admin session: what is live may have changed (a scheduled go-live) since the page loaded.
  useEffect(() => {
    let alive = true;
    void refreshPublished(() => alive);
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The Publish / Discard questions compare against what is live right now, not what was live when Studio opened.
  useEffect(() => {
    if (!confirmAction) return;
    let alive = true;
    void refreshPublished(() => alive);
    return () => { alive = false; };
  }, [confirmAction]); // eslint-disable-line react-hooks/exhaustive-deps
  const exit = () => {
    if (inlineEditingRef.current) { say("err", "Finish or cancel the preview text edit before leaving Studio."); return; }
    if (pageBusy) { say("err", "Wait for the page save to finish before leaving Studio."); return; }
    if (dirtyDraft || draftPage) {
      void askConfirm({ title: "Leave without saving?", message: "You have unsaved edits. They stay recoverable on this device, but they are not saved as your draft.", confirmLabel: "Leave Studio" })
        .then(ok => { if (ok) onExit(); });
      return;
    }
    onExit();
  };

  // warn on tab close, keyboard shortcuts
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirtyDraft || draftPage || pageBusy || inlineEditingRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirtyDraft, draftPage, pageBusy]);
  // One keyboard listener for the whole editor; the latest handlers are read through a ref, so it
  // is registered once. The preview forwards its key presses here too (KEY_COMMAND).
  // `forPanel`: a command that names the panel's section itself (Find › current selection), not a keyboard shortcut.
  // Clicking the tab you are already on keeps what you selected; changing tabs clears it and remembers each tab's scroll.
  const selectRail = (id: LeftTab) => {
    setMobilePanel("outline");
    // Clicking the tab already open keeps the selection; on Theme settings it still leaves an element's focus card.
    if (id === leftTab) { setStyleFocus(null); return; }
    restoreScrollFor.current = id;
    setLeftTab(id); setStyleFocus(null); setSelectedId(null); setBlockId(null); setSelectedElement(null);
  };
  /** Moves the selected section one place on its page (shortcut and the inspector's Move up / Move down). */
  const moveSelectedSection = (direction: -1 | 1) => {
    if (!selected) return;
    const index = sections.findIndex(x => x.id === selected.id), to = index + direction;
    if (index < 0 || to < 0 || to >= sections.length) return;
    setList(l => moveSection(l, index, to), { label: `Move ${sectionTitle(selected).label} ${direction < 0 ? "up" : "down"}` });
  };
  const runShortcut = (action: ShortcutAction, forPanel = false) => {
    if (busy === "discard") return;
    if (inlineEditingRef.current && ["save", "undo", "redo", "delete", "duplicate", "moveUp", "moveDown"].includes(action)) {
      if (action === "save") say("err", "Finish the text edit first: press Done (or Escape to cancel), then save.");
      return;
    }
    // A plain-text click outlines a section in the preview without opening it in the panel; the section
    // shortcuts act on the panel's section, so refuse them while the outline is on a different one.
    const outlined = canvasSelectionRef.current?.sectionId;
    if (!forPanel && outlined && outlined !== selected?.id && ["delete", "duplicate", "moveUp", "moveDown"].includes(action)) {
      say("err", "The section outlined in the preview isn't the one open in the panel. Click Edit on it first.");
      return;
    }
    const index = selected ? sections.findIndex(x => x.id === selected.id) : -1;
    switch (action) {
      case "find": setFindOpen(true); break;
      case "save":
        if (leftTab === "pages") break;
        if (!dirtyDraft) say("ok", "No unsaved changes to save.");
        else if (busy !== null) say("err", "Still saving — try again in a moment.");
        else saveDraft();
        break;
      case "undo": stepHistory("undo"); break;
      case "redo": stepHistory("redo"); break;
      case "help": setShortcutsOpen(true); break;
      case "back": goBackPlace(); break;
      case "desktop": case "tablet": case "mobile": setDevice(action); break;
      case "toggleMode": setMode(m => m === "edit" ? "browse" : "edit"); break;
      case "workbench":
        if (narrow) openHealth();
        else if (workbench.open) setWorkbench(w => ({ ...w, open: false }));
        else openWorkbench(workbench.tab);
        break;
      case "addSection": selectRail("sections"); setAdding(sections.length); break;
      case "prevSection": case "nextSection": {
        if (!sections.length) break;
        const to = index < 0 ? (action === "nextSection" ? 0 : sections.length - 1) : Math.min(sections.length - 1, Math.max(0, index + (action === "nextSection" ? 1 : -1)));
        if (to !== index) openSectionAnywhere(sections[to].id);
        break;
      }
      case "deselect": if (selectedId) { setSelectedId(null); setBlockId(null); } else if (selectedElement) closeElement(); break;
      case "delete": if (selected && !blockId) delSection(selected.id); break;
      case "duplicate": if (selected) dupSection(selected.id); break;
      case "moveUp": case "moveDown": moveSelectedSection(action === "moveUp" ? -1 : 1); break;
      default:
        if (action.startsWith("go:")) selectRail(action.slice(3) as LeftTab);
    }
  };
  const goPendingRef = useRef(0);
  const shortcutRef = useRef(runShortcut);
  shortcutRef.current = runShortcut;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /input|textarea|select/i.test(el?.tagName || "") || !!el?.isContentEditable;
      const onControl = !!el?.closest?.("button, a[href], [role=button], [role=tab], [role=menuitem]");
      const dialogOpen = !!document.querySelector("[role=dialog][aria-modal=true], .rp-dialog-root [role=dialog]");
      // "G then a letter" opens a workspace; the second key must follow within GO_SEQUENCE_MS.
      const pendingGo = goPendingRef.current && Date.now() - goPendingRef.current < GO_SEQUENCE_MS;
      goPendingRef.current = 0;
      if (pendingGo && !typing && !dialogOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const go = resolveGoKey(e.key);
        if (go) { e.preventDefault(); shortcutRef.current(go); return; }
      }
      const action = resolveShortcut({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey, typing, dialogOpen, onControl });
      if (!action) return;
      e.preventDefault();
      if (action === "goPrefix") { goPendingRef.current = Date.now(); return; }
      shortcutRef.current(action);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  // ── section actions ──
  const addSection = (type: string) => {
    const meta = getSectionMeta(type);
    const s = makeSection(type, meta?.defaults || {});
    const at = adding ?? sections.length;
    setList((l) => keepPageText(insertSection(l, s, at)), { label: `Add ${meta?.label || "section"}` });
    setSelectedId(s.id);
    setAdding(null);
    setBlockId(null);
    setMobilePanel("settings");
    setTimeout(() => highlight(s.id, true), 400);
  };
  /** Add section › Draft with AI › Add to page: the drafted section, as one undoable change. */
  const addDraftedSection = (drafted: Section) => {
    const s = { ...drafted, id: newId() };
    const at = adding ?? sections.length;
    setList((l) => insertSection(l, s, at), { label: `Add ${getSectionMeta(s.type)?.label || "section"} drafted with AI` });
    say("ok", "Added the section the AI drafted. Check its words before publishing.", undoAction());
    setSelectedId(s.id); setAdding(null); setBlockId(null); setMobilePanel("settings");
    setTimeout(() => highlight(s.id, true), 400);
  };
  const dupSection = (id: string) => {
    const r = duplicateSection(sections, id);
    setList(() => r.list, { label: "Duplicate section" });
    if (r.newId) { setSelectedId(r.newId); setBlockId(null); }
  };
  // Deleting is instant and undoable (toast › Undo, or Ctrl/Cmd+Z) — no confirmation pop-up.
  const delSection = (id: string) => {
    const gone = sections.find(x => x.id === id);
    setList((l) => removeSection(l, id), { label: `Delete ${gone ? sectionTitle(gone).label : "section"}` });
    if (selectedId === id) { setSelectedId(null); setBlockId(null); }
    say("warn", `Deleted ${gone ? sectionTitle(gone).label : "the section"}.`, undoAction());
  };
  // Block library 3.0: Add block (the picker), Copy block and Paste copied block. Each add is one named, undoable change.
  const openBlockPicker = (sectionId: string) => {
    setAdding(null); setLeftTab("sections"); setSelectedId(sectionId); setBlockId(null); setMobilePanel("outline"); setBlockPicker(sectionId);
  };
  const openBlockPickerRef = useRef(openBlockPicker); openBlockPickerRef.current = openBlockPicker;
  const pickerOwner = blockPicker ? findSectionOwner(design, blockPicker) : null;
  useEffect(() => { if (blockPicker && !pickerOwner) setBlockPicker(null); }, [blockPicker, pickerOwner]);
  // The picker belongs to one section on Page layout: leaving either closes it (and takes its try-on block off the page).
  useEffect(() => { if (blockPicker && (leftTab !== "sections" || selectedId !== blockPicker)) setBlockPicker(null); }, [leftTab, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const insertBlockInto = (sectionId: string, block: any, afterId: string | null, label: string) => {
    const owner = findSectionOwner(designRef.current, sectionId); if (!owner) return;
    const key = getBlocksKey(owner.section.type);
    change(d => updateSectionsById(d, [sectionId], s => {
      const list = s.settings?.[key] || s.settings?.blocks || [];
      return { ...s, settings: { ...s.settings, [key]: afterId && findBlock(list, afterId) ? insertBlockAfter(list, afterId, block) : [...list, block] } };
    }), { label });
    setSelectedId(sectionId); setBlockId(block.id); setMobilePanel("settings"); highlight(sectionId, true, block.id);
  };
  const addBlockFromPicker = (choice: BlockChoice) => {
    const sectionId = blockPicker; setBlockPicker(null);
    if (sectionId) insertBlockInto(sectionId, choice.make(), null, choice.id === "clipboard" ? "Paste block" : `Add ${choice.label}`);
  };
  const copyBlockNow = (section: Section, id: string) => {
    const key = getBlocksKey(section.type);
    const block = findBlock(section.settings[key] || section.settings.blocks || [], id); if (!block) return;
    setCopiedBlock(copyBlock(section.type, block));
    say("ok", `Block copied. Paste it into any ${getSectionMeta(section.type)?.label || "section"} section with Paste copied block.`);
  };
  const pasteBlockNow = (section: Section, afterId: string | null) => {
    if (!canPasteBlock(copiedBlock, section.type)) {
      say("warn", copiedBlock ? `That block came from a ${getSectionMeta(copiedBlock.sectionType)?.label || "different"} section, so it only pastes into one of those.` : "Copy a block first: select it and choose Copy block.");
      return;
    }
    const linkedTo = copiedBlock!.block.sharedBlockId;
    if (linkedTo && !(designRef.current.sharedBlocks || []).some((x: SharedBlock) => x.id === linkedTo)) {
      say("warn", "The copied block was linked to a shared block that has since been deleted, so there's nothing to paste. Copy the block again.");
      return;
    }
    const block = pasteBlock([], copiedBlock!).list[0];
    const key = getBlocksKey(section.type);
    // Blocks nest 3 levels deep at most; a group pasted beside a deeply nested block goes at the end instead of losing its inner blocks.
    const fits = fitsAfter(section.settings[key] || section.settings.blocks || [], afterId, block);
    insertBlockInto(section.id, block, fits ? afterId : null, "Paste block");
    say("ok", fits ? "Block pasted." : "Block pasted at the end of the section: there it keeps all the blocks inside it (blocks nest 3 levels deep at most).", undoAction());
  };
  const pickerChoices = useMemo(() => {
    if (!pickerOwner) return [];
    const section = pickerOwner.section, meta = getSectionMeta(section.type);
    const key = getBlocksKey(section.type);
    return blockChoices(meta ? { ...meta, type: section.type } : undefined, {
      existing: section.settings?.[key] || section.settings?.blocks || [], sharedBlocks: design.sharedBlocks || [],
      clip: copiedBlock?.block.sharedBlockId && !(design.sharedBlocks || []).some((x: SharedBlock) => x.id === copiedBlock.block.sharedBlockId) ? null : copiedBlock,
      labelOf: (b, i) => blockLabel(b, i, meta?.blockLabel),
    });
  }, [pickerOwner, design.sharedBlocks, copiedBlock]);
  const pasteSection = () => {
    if (!copiedSection) return;
    const clone = duplicateSection([copiedSection], copiedSection.id).list[1];
    setList(l => keepPageText(insertSection(l, clone, l.length)), { label: "Paste section" }); setSelectedId(clone.id); say("ok", "Section pasted onto this page.");
  };
  const saveSection = async (section: Section) => {
    const name = await askText({ title: "Save section for reuse", label: "Name", defaultValue: sectionTitle(section).label, confirmLabel: "Save section" });
    if (name === null) return;
    const preset = { id: `preset-${Date.now()}`, name: name.trim() || sectionTitle(section).label, section: JSON.parse(JSON.stringify(section)) };
    setStyle("sectionPresets", [...(design.sectionPresets || []), preset]); say("ok", "Section saved. Add it to any page from Add section › Your saved sections.");
  };
  const surfaceLabel = (surface: string) => isGroupSurface(surface) ? `Every page · ${groupLabel(surface)}` : templates.find(t => t.id === surface)?.label || surface;
  const STYLE_KEYS = useMemo(() => [...sectionStyleFields().map(f => f.key), ...SPACING_CARD_KEYS], []);
  // Where a block may move: other sections of the same kind, on any page.
  const blockDestinations = (sectionId: string) => {
    const from = findSectionOwner(design, sectionId);
    if (!from) return [];
    return sectionEntries(design).flatMap(entry => entry.sections
      .filter(s => s.id !== sectionId && s.type === from.section.type)
      .map(s => ({ value: s.id, label: `${surfaceLabel(entry.surface)} › ${sectionTitle(s).label}` })));
  };
  const outlineActions: OutlineActions = {
    copy: id => { const sec = sections.find(x => x.id === id); if (!sec) return; setCopiedSection(JSON.parse(JSON.stringify(sec))); say("ok", "Section copied. Use Paste copied section below, on this page or another."); },
    canPaste: Boolean(copiedSection),
    paste: afterId => {
      if (!copiedSection) return;
      const copy = duplicateSection([copiedSection], copiedSection.id).list[1];
      setList(l => keepPageText(insertSection(l, copy, l.findIndex(x => x.id === afterId) + 1)), { label: "Paste section" });
      setSelectedId(copy.id); setBlockId(null);
    },
    copyStyle: id => {
      const sec = sections.find(x => x.id === id); if (!sec) return;
      setCopiedStyle(Object.fromEntries(STYLE_KEYS.filter(k => sec.settings[k] !== undefined).map(k => [k, JSON.parse(JSON.stringify(sec.settings[k]))])));
      say("ok", "Style copied. Choose Paste style on another section, or on several picked sections.");
    },
    canPasteStyle: Boolean(copiedStyle),
    pasteStyle: ids => {
      if (!copiedStyle) return;
      change(d => updateSectionsById(d, ids, sec => {
        const settings = { ...sec.settings };
        for (const k of STYLE_KEYS) delete settings[k];
        return { ...sec, settings: { ...settings, ...JSON.parse(JSON.stringify(copiedStyle)) } };
      }), { label: ids.length > 1 ? `Paste style onto ${ids.length} sections` : "Paste style" });
      say("ok", ids.length > 1 ? `Style pasted onto ${ids.length} sections.` : "Style pasted.", undoAction());
    },
    moveToPage: ids => { setMoveDest(""); setMoveDialog({ kind: "sections", ids }); },
    saveForReuse: id => { const sec = sections.find(x => x.id === id); if (sec) void saveSection(sec); },
    setVisible: (ids, visible) => change(d => updateSectionsById(d, ids, sec => ({ ...sec, visible })),
      { label: `${visible ? "Show" : "Hide"} ${ids.length} section${ids.length === 1 ? "" : "s"}` }),
    remove: ids => {
      const run = () => {
        change(d => updateSectionsById(d, ids, () => null), { label: `Delete ${ids.length} section${ids.length === 1 ? "" : "s"}` });
        if (selectedId && ids.includes(selectedId)) { setSelectedId(null); setBlockId(null); }
        say("warn", `Deleted ${ids.length} section${ids.length === 1 ? "" : "s"}.`, undoAction());
      };
      // One or two sections are undone from the toast; three or more ask first.
      if (ids.length < 3) { run(); return; }
      void askConfirm({ title: `Delete ${ids.length} sections?`, message: "They will be removed from this page. You can undo this right after with the Undo button or Ctrl+Z.", confirmLabel: `Delete ${ids.length} sections` })
        .then(ok => { if (ok) run(); });
    },
    moveBlock: (sectionId, blockId) => { setMoveDest(""); setMoveDialog({ kind: "block", sectionId, blockId }); },
  };
  const confirmMove = () => {
    const dialog = moveDialog; if (!dialog || !moveDest) return;
    setMoveDialog(null);
    if (dialog.kind === "sections") {
      change(d => dialog.ids.reduce((acc, id) => moveSectionTo(acc, id, moveDest), d),
        { label: `Move ${dialog.ids.length === 1 ? "section" : `${dialog.ids.length} sections`} to ${surfaceLabel(moveDest)}` });
      if (selectedId && dialog.ids.includes(selectedId)) { setSelectedId(null); setBlockId(null); }
      say("ok", `Moved to ${surfaceLabel(moveDest)}.`, undoAction());
      return;
    }
    const result = moveBlockTo(designRef.current, { fromSectionId: dialog.sectionId, blockId: dialog.blockId, toSectionId: moveDest }, getBlocksKey);
    if (result.error) { say("err", result.error); return; }
    change(() => result.design, { label: "Move block to another section" });
    setSelectedId(moveDest); setBlockId(dialog.blockId);
    say("ok", "Block moved.", undoAction());
  };
  // ── alternate templates (2.8) ──
  const createTemplateAsk = async (base: AltBase, from: string) => {
    const name = await askText({ title: `New ${ALT_BASE_LABELS[base].toLowerCase()} template`, label: "Name (e.g. Poetry)", defaultValue: "", confirmLabel: "Create template" });
    if (name === null || !name.trim()) return;
    const made = createAlternate(designRef.current, base, name, from);
    change(() => made.design, { label: `Create template “${name.trim()}”` });
    setShowGlobal(false); setTemplateId(altSurface(base, made.id)); setSelectedId(null); setBlockId(null);
    say("ok", `Template “${name.trim()}” created from ${from === base ? "the default" : "that template"}. ${base === "productPage" ? "Pick it for books in Books › edit › Categories & tags." : "Pick it for categories in Navigation › Shop categories."}`);
  };
  const renameTemplateAsk = async (base: AltBase, id: string, current: string) => {
    const name = await askText({ title: "Rename template", label: "Name", defaultValue: current, confirmLabel: "Rename" });
    if (name === null || !name.trim()) return;
    change(d => renameAlternate(d, base, id, name), { label: "Rename template" });
  };
  const deleteTemplateNow = (base: AltBase, id: string, name: string) => {
    change(d => deleteAlternate(d, base, id), { label: `Delete template “${name}”` });
    setTemplateId(base); setSelectedId(null); setBlockId(null);
    say("warn", `Template “${name}” deleted. Anything that used it shows the default layout.`, undoAction());
  };
  /** Add section › "Add it there instead": add a section to the group or page it is made for, and go there. */
  const addSectionBestPlace = (type: string) => {
    const meta = getSectionMeta(type);
    const best = meta?.bestIn;
    const s = makeSection(type, meta?.defaults || {});
    const label = { label: `Add ${meta?.label || "section"}` };
    if (best?.group) {
      const group = best.group;
      change(d => writeSections(d, group, [...(Array.isArray(d[group]) ? d[group] : []), s]), label);
      setShowGlobal(true); setGlobalGroup(group);
    } else if (best?.template && templates.some(t => t.id === best.template)) {
      const page = best.template;
      change(d => writeSections(d, page, [...(d[page]?.sections || []), s]), label);
      setShowGlobal(false); setTemplateId(page);
    } else { addSection(type); return; }
    setSelectedId(s.id); setAdding(null); setBlockId(null); setMobilePanel("settings");
    setTimeout(() => highlight(s.id, true), 600);
  };
  const renamePresetAsk = async (preset: any) => {
    const name = await askText({ title: "Rename saved section", label: "Name", defaultValue: preset.name || "", confirmLabel: "Rename" });
    if (name === null || !name.trim()) return;
    change(d => renamePreset(d, preset.id, name), { label: "Rename saved section" });
  };
  const deletePresetNow = (preset: any) => {
    change(d => deletePreset(d, preset.id), { label: "Delete saved section" });
    say("warn", `“${preset.name}” deleted from your saved sections.`, undoAction());
  };
  const renameSharedAsk = async (shared: SharedBlock) => {
    const name = await askText({ title: "Rename shared block", label: "Name", defaultValue: shared.name || "", confirmLabel: "Rename" });
    if (name === null || !name.trim()) return;
    change(d => renameSharedBlock(d, shared.id, name), { label: "Rename shared block" });
  };
  const deleteSharedNow = (shared: SharedBlock) => {
    change(d => deleteSharedBlock(d, shared.id), { label: "Delete shared block" });
    say("warn", `“${shared.name}” deleted. Where it was placed, a copy stays.`, undoAction());
  };
  const addPreset = (preset: any) => {
    const source = preset.section;
    const clone = duplicateSection([source], source.id).list[1];
    const at = adding;
    setList(l => keepPageText(insertSection(l, clone, at ?? l.length)), { label: `Add ${preset.name || "saved section"}` }); setSelectedId(clone.id); setAdding(null); setBlockId(null);
  };

  // ── Find anything (Ctrl/Cmd+K): one search over every control, word, page, section and action ──
  // Built-in parts of the previewed page (header, buy card, bag…), so they can be found by name.
  const structureElements = useMemo(() => {
    if (!structure) return [];
    const zones: [string, StructureItem[]][] = [["Header", structure.header], ["Page", structure.main], ["Footer", structure.footer], ["Pop-ups", structure.overlay], ["Whole page", structure.page]];
    const out: { key: string; label: string; where: string; target: string }[] = [];
    const walk = (items: StructureItem[], where: string) => items.forEach(i => { out.push({ key: i.key, label: i.label, where, target: i.target }); walk(i.children, `${where} › ${i.label}`); });
    for (const [zone, items] of zones) walk(items, `This page › ${zone}`);
    return out;
  }, [structure]);
  // Built only while Find anything is open: it indexes thousands of entries, so rebuilding it on every keystroke
  // with the window closed was wasted work (Phase 4).
  const searchIndex = useMemo(() => !findOpen ? [] as ReturnType<typeof buildStudioIndex> : buildStudioIndex({
    styleGroups: [...STYLE_GROUPS, ...Object.entries(EXTRA_STYLE_CATEGORIES).map(([id, c]) => ({ id, title: c.title, hint: c.blurb, fields: [] }))],
    copySchema: COPY_SCHEMA, templates, pages,
    sectionsByTemplate: {
      __global: getSections(design, { kind: "global" }),
      headerSections: getSections(design, { kind: "global", group: "headerSections" }),
      overlaySections: getSections(design, { kind: "global", group: "overlaySections" }),
      ...Object.fromEntries(templates.map(t => [t.id, getSections(design, { kind: "template", id: t.id })])),
    },
    sectionLabel: (type: string) => getSectionMeta(type)?.label || type,
    elements: structureElements,
    books,
  }), [findOpen, design, templates, pages, structureElements, books]);
  // Commands for the current selection, offered first in Find anything.
  const selectedIndex = selected ? sections.findIndex(x => x.id === selected.id) : -1;
  const paletteContext = useMemo(() => contextCommands({
    section: selected && selectedIndex >= 0 ? { id: selected.id, label: sectionTitle(selected).label, visible: selected.visible !== false, first: selectedIndex === 0, last: selectedIndex === sections.length - 1 } : undefined,
    element: selectedElement ? { label: selectedElement.label || "Page part", hasTheme: elementTabs(selectedElement, device as RegionDevice, design).styleGroups.length > 0 } : undefined,
    canPasteStyle: Boolean(copiedStyle),
    blocks: selected ? {
      takesBlocks: Boolean(getSectionMeta(selected.type)?.blockType),
      blockLabel: blockId ? selectedBlockCrumb(selected, blockId).label : undefined,
      canPaste: canPasteBlock(copiedBlock, selected.type),
    } : undefined,
  }), [selected, selectedIndex, sections.length, selectedElement, copiedStyle, copiedBlock, blockId, device, design]);
  const runContext = (id: string) => {
    const sid = selected?.id;
    switch (id) {
      case "section-duplicate": runShortcut("duplicate", true); break;
      case "section-delete": runShortcut("delete", true); break;
      case "section-up": runShortcut("moveUp", true); break;
      case "section-down": runShortcut("moveDown", true); break;
      case "section-hide": if (sid) outlineActions.setVisible([sid], false); break;
      case "section-show": if (sid) outlineActions.setVisible([sid], true); break;
      case "section-copy": if (sid) outlineActions.copy(sid); break;
      case "section-copy-style": if (sid) outlineActions.copyStyle(sid); break;
      case "block-add": if (sid) openBlockPicker(sid); break;
      case "block-copy": if (selected && blockId) copyBlockNow(selected, blockId); break;
      case "block-paste": if (selected) pasteBlockNow(selected, blockId); break;
      case "section-paste-style": if (sid) outlineActions.pasteStyle([sid]); break;
      case "section-move-page": if (sid) outlineActions.moveToPage([sid]); break;
      case "section-save": if (sid) outlineActions.saveForReuse(sid); break;
      case "element-theme": if (selectedElement) openElementInTheme(selectedElement); break;
      case "element-close": closeElement(); break;
    }
  };
  useEffect(() => { if (leftTab !== "pages") setOpenPage(null); }, [leftTab]);
  // Pages tab: the canvas follows the page being edited, so its unsaved body/title edits are visible.
  const showPageInPreview = useCallback((slug: string) => {
    setShowGlobal(false); setSelectedId(null); setBlockId(null); setTemplateId(`page:${slug}`);
  }, []);

  const flashPanel = (selector: string, focusInside = false) => setTimeout(() => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("studio-flash");
    setTimeout(() => el.classList.remove("studio-flash"), 1600);
    if (focusInside) el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
  }, 160);
  const autoFitPage = (overwrite = false) => {
    const r = autoFitSections(sections, overwrite);
    const regions = autoFitRegions({ ...design.regions, ...(target.kind === "template" ? design[target.id]?.regions : {}) }, overwrite);
    if (!r.touched && !regions.changes.length) { say("ok", "Nothing new to adjust for phones. Check the phone preview for this page."); return; }
    change(d => {
      let next = setSections(d, target, r.value);
      for (const [key, value] of Object.entries(regions.value)) {
        next = target.kind === "template" ? applyPageStyle(next, target.id, `regions.${key}`, value)
          : applyGlobalStyle(next, `regions.${key}`, value, surfaceIds);
      }
      return next;
    });
    setDevice("mobile");
    say("ok", `Auto-fitted ${r.touched} sections and ${regions.changes.length} page-part settings for phones. Check the preview; Undo (Ctrl+Z) reverts.`);
  };
  const runAction = (id: string) => {
    switch (id) {
      case "save": if (dirtyDraft && busy === null) saveDraft(); else say("ok", "No unsaved changes to save."); break;
      case "publish":
        if (inlineEditingRef.current) say("err", "Finish or cancel the preview text edit before publishing.");
        else if (busy !== null) say("err", "Still saving — try again in a moment.");
        else if (unpublished || dirtyDraft) setConfirmAction("publish"); else say("ok", "Nothing to publish — the live shop already matches this draft.");
        break;
      case "discard":
        if (inlineEditingRef.current) say("err", "Finish or cancel the preview text edit before discarding.");
        else if (busy !== null) say("err", "Still saving — try again in a moment.");
        else if (unpublished) setConfirmAction("discard"); else say("ok", "No draft changes to discard.");
        break;
      case "history": setHistoryOpen(true); loadVersions(); break;
      case "schedule": setSchedule({ themeId: null }); break;
      case "check": openHealth(); break;
      case "workbench-health": openWorkbench("health"); break;
      case "workbench-changes": openWorkbench("changes"); break;
      case "workbench-setup": openWorkbench("setup"); break;
      case "brand-kit": openBrandKit(); break;
      case "site-health": runSiteHealth(); break;
      case "preview-tab": openPreviewTab(); break;
      case "undo": stepHistory("undo"); break;
      case "redo": stepHistory("redo"); break;
      case "device-desktop": setDevice("desktop"); setMobilePanel("preview"); break;
      case "device-tablet": setDevice("tablet"); setMobilePanel("preview"); break;
      case "device-mobile": setDevice("mobile"); setMobilePanel("preview"); break;
      case "mode-toggle": setMode(m => m === "edit" ? "browse" : "edit"); break;
      case "autofit-page": setLeftTab("sections"); autoFitPage(false); break;
      case "add-section": setLeftTab("sections"); setAdding(sections.length); break;
      case "ai-draft": setLeftTab("sections"); setAiDraftOpen(n => n + 1); setAdding(sections.length); break;
      case "fill-page-seo": setLeftTab("pages"); setFillSeoRequest(Date.now()); break;
    }
  };
  // ── Where am I, and the way back (placeHistory.ts) ──────────────────────────────────────────
  // The place is watched from state, so every way of moving (Find, a click in the preview, Show on page, the rail,
  // the page picker, a followed link) is remembered without each call site recording it. Back restores the last one.
  const place = useMemo((): Place => normalizePlace({
    leftTab, styleCategory, textCategory, styleFocus, templateId: template.id, showGlobal, globalGroup,
    selectedId: selected?.id || null, blockId: selected ? blockId : null, element: selectedElement,
  }), [leftTab, styleCategory, textCategory, styleFocus, template.id, showGlobal, globalGroup, selected?.id, blockId, selectedElement]);
  const [placeHist, setPlaceHist] = useState<PlaceHistory>(EMPTY_PLACES);
  const restoredAt = useRef(0);
  const placeSig = placeKey(place);
  useEffect(() => {
    const now = Date.now(), restoring = now - restoredAt.current < 400;
    setPlaceHist(h => restoring ? settlePlace(h, place, now) : visitPlace(h, place, now));
  }, [placeSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const placeLabels: PlaceLabels = {
    workspace: tab => sidebarTabs.find(([id]) => id === tab)?.[1] || tab,
    styleCategory: id => id === CHANGED_CATEGORY ? "What I've changed" : categoryTitle(id),
    textCategory: id => id === CHANGED_CATEGORY ? "Text I've changed" : id,
    page: p => p.showGlobal ? `Every page · ${groupLabel(p.globalGroup as SectionGroupKey)}` : templates.find(t => t.id === p.templateId)?.label || p.templateId,
    section: p => { const owner = p.selectedId ? findSectionOwner(design, p.selectedId) : null; return owner ? sectionTitle(owner.section).label : null; },
    block: p => { const owner = p.selectedId && p.blockId ? findSectionOwner(design, p.selectedId) : null; return owner && p.blockId ? selectedBlockCrumb(owner.section, p.blockId).label : null; },
  };
  /** An earlier place as it can be shown now: a section or block deleted since is taken out, a page that is gone returns null. */
  const resolvePlace = (p: Place): Place | null => {
    if (!sidebarTabs.some(([id]) => id === p.leftTab)) return null;
    if (!p.showGlobal && !templates.some(t => t.id === p.templateId)) return null;
    let next = p;
    if (p.selectedId) {
      const owner = findSectionOwner(designRef.current, p.selectedId);
      if (!owner || owner.surface !== (p.showGlobal ? p.globalGroup : p.templateId)) next = { ...next, selectedId: null, blockId: null };
      else if (p.blockId) {
        const blocks = owner.section.settings?.[getBlocksKey(owner.section.type)] || owner.section.settings?.blocks || [];
        if (!findBlock(blocks, p.blockId)) next = { ...next, blockId: null };
      }
    }
    // A page part belongs to the page it was found on; its key means nothing on another page.
    if (next.element && (next.showGlobal !== showGlobal || next.templateId !== templateIdRef.current)) next = { ...next, element: null };
    return next;
  };
  const applyPlace = (p: Place) => {
    restoredAt.current = Date.now();
    if (p.leftTab !== leftTab) restoreScrollFor.current = p.leftTab;
    setAdding(null); setBlockPicker(null);
    setLeftTab(p.leftTab as LeftTab);
    setStyleSearch(""); setCopyFilter("");
    setStyleCategory(p.styleCategory); setTextCategory(p.textCategory); setStyleFocus(p.styleFocus);
    setShowGlobal(p.showGlobal);
    if (p.showGlobal) setGlobalGroup(p.globalGroup as SectionGroupKey); else setTemplateId(p.templateId);
    setSelectedId(p.selectedId); setBlockId(p.blockId);
    setSelectedElement(p.element);
    postPreview({ type: "SELECT_NODE", key: p.element ? p.element.key : null });
    setMobilePanel(p.selectedId || p.element ? "settings" : "outline");
    if (p.selectedId) setTimeout(() => highlight(p.selectedId, true, p.blockId), 350);
  };
  const goBackPlace = () => {
    if (inlineEditingRef.current) { say("err", "Finish or cancel the preview text edit first, then go back."); return; }
    const result = goBack(placeHist, resolvePlace, Date.now());
    if (!result) {
      say("ok", placeHist.back.length ? "The places you were in before are gone, so there is nowhere to go back to." : "Nothing to go back to yet. Back returns you to where you were before your last jump.");
      if (placeHist.back.length) setPlaceHist(h => ({ ...h, back: [] }));
      return;
    }
    const leavesPage = styleScope === "page" && (result.place.templateId !== template.id || Boolean(result.place.showGlobal) !== showGlobal);
    scopeNoteBySelfRef.current = leavesPage;
    applyPlace(result.place);
    setPlaceHist(result.history);
    say("ok", `Back to ${describePlace(result.place, placeLabels)}${leavesPage ? ". Editing scope is All pages again." : ""}`);
  };
  const backTarget = peekBack(placeHist);
  /** A crumb steps back out to its level (the last crumb is where you are). */
  const crumbAction = (level: ReturnType<typeof placeCrumbs>[number]["level"]): (() => void) | undefined => {
    switch (level) {
      case "workspace": return () => {
        setStyleSearch(""); setCopyFilter("");
        if (leftTab === "style") { setStyleCategory(null); setStyleFocus(null); }
        if (leftTab === "text") setTextCategory(null);
        setSelectedId(null); setBlockId(null); if (selectedElement) closeElement();
      };
      case "category": return () => { setStyleFocus(null); setSelectedId(null); setBlockId(null); if (selectedElement) closeElement(); };
      case "focus": return () => { if (selectedElement) closeElement(); };
      case "page": return () => { setSelectedId(null); setBlockId(null); if (selectedElement) closeElement(); };
      case "section": return () => setBlockId(null);
      default: return undefined;
    }
  };
  const goToResult = (entry: SearchEntry, query = "") => {
    const t = entry.target;
    setMobilePanel("outline");
    if (t.type === "action") { runAction(t.id); return; }
    if (t.type === "context") { runContext(t.id); return; }
    if (t.type === "element") {
      const item = structure && [...structure.header, ...structure.main, ...structure.footer, ...structure.overlay, ...structure.page]
        .flatMap(function all(i: StructureItem): StructureItem[] { return [i, ...i.children.flatMap(all)]; }).find(i => i.key === t.key);
      if (item) { setLeftTab("sections"); openStructureItem(item); } else say("err", "That part isn't on the page in the preview any more.");
      return;
    }
    if (t.type === "book") { setSelectedId(null); setBlockId(null); setShowGlobal(false); setProductSlug(t.slug); setTemplateId("productPage"); setLeftTab("sections"); return; }
    if (t.type === "tab") {
      // "Browse Theme settings / Text & labels" means the browse home, not the last category used.
      setLeftTab(t.tab); setStyleFocus(null); setSelectedId(null); setBlockId(null);
      setStyleCategory(null); setStyleSearch(""); setTextCategory(""); setCopyFilter("");
      return;
    }
    if (t.type === "style") {
      setSelectedId(null); setBlockId(null); setStyleSearch(""); setStyleCategory(t.groupId); setStyleFocus(null); setLeftTab("style");
      // Search lists an element setting once (its desktop field); open it at the size being previewed.
      let key = t.key;
      const region = key ? REGION_GROUPS.find(g => g.id === t.groupId)?.regions.find(r => {
        const prefix = "regions." + regionKey(r.id, "", regionFieldDevice(key!));
        return key!.startsWith(prefix) && REGION_SUFFIXES.includes(key!.slice(prefix.length));
      }) : undefined;
      if (region && key) {
        // "…phone padding" opens the phone setting (and the phone preview); otherwise the size being previewed.
        const asked = searchedDevice(query);
        if (asked && asked !== device) setDevice(asked);
        const prefix = "regions." + regionKey(region.id, "", regionFieldDevice(key));
        key = "regions." + regionKey(region.id, key.slice(prefix.length), asked || device);
        openRegion(t.groupId, region.label);
      }
      if (key) setFieldFocus({ key, nonce: Date.now() });
      const panel = `style:${t.groupId}`;
      setFocus(f => ({ id: panel, nonce: f.nonce + 1 }));
      flashPanel(key ? `[data-style-key="${CSS.escape(key)}"]` : `[data-studio-panel="${CSS.escape(panel)}"]`, Boolean(key));
      return;
    }
    if (t.type === "copy") {
      setTextCategory(t.group); setLeftTab("text"); setSelectedId(null); setBlockId(null);
      setCopyFilter(t.key || "");
      if (t.key) setFieldFocus({ key: t.key, nonce: Date.now() });
      setFocus(f => ({ id: `copy:${t.group}`, nonce: f.nonce + 1 }));
      flashPanel(t.key ? `[data-copy-key="${CSS.escape(t.key)}"]` : `[data-studio-panel="${CSS.escape(`copy:${t.group}`)}"]`, Boolean(t.key));
      return;
    }
    if (t.type === "menus") { setLeftTab("menus"); setSelectedId(null); flashPanel(`[data-studio-panel="${CSS.escape(t.panel)}"]`); return; }
    if (t.type === "template") { setSelectedId(null); setBlockId(null); setShowGlobal(false); setTemplateId(t.id); setLeftTab("sections"); return; }
    if (t.type === "section") {
      if (t.templateId === "__global" || isGroupSurface(t.templateId)) { setShowGlobal(true); setGlobalGroup(t.templateId === "__global" ? "globalSections" : t.templateId as SectionGroupKey); }
      else { setShowGlobal(false); setTemplateId(t.templateId); }
      setLeftTab("sections"); setSelectedId(t.sectionId); setBlockId(null); setMobilePanel("settings");
      setTimeout(() => highlight(t.sectionId, true, null), 500);
      return;
    }
    if (t.type === "page") { setLeftTab("pages"); setOpenPage({ slug: t.slug, nonce: Date.now() }); }
  };

  const sidebarTabs: [LeftTab, string][] = [["sections", "Page layout"], ["style", "Theme settings"], ["text", "Text & labels"], ["menus", "Navigation"], ["pages", "Pages"], ["media", "Media"], ["themes", "Themes"]];
  const q = copyFilter.trim().toLowerCase();
  const visibleStyleGroups = filterSettingGroups(STYLE_GROUPS, styleSearch, styleCategory);
  // Theme settings home: task headings over the same categories, with "changed" counts.
  // "N changed" badges walk every Theme settings field: only while Theme settings is open (Phase 4).
  const changed = useMemo(() => leftTab === "style" ? changedCounts(STYLE_GROUPS, design, defaults) : { total: 0, byGroup: {} as Record<string, number> },
    [leftTab, design, defaults]);
  const themeHome: HomeHeading[] = THEME_HEADINGS.map(h => ({ ...h, categories: h.groups.map(id => {
    const group = STYLE_GROUPS.find(g => g.id === id);
    return { id, title: EXTRA_STYLE_CATEGORIES[id]?.title || group?.title || id, blurb: blurbFor(group, id), changed: changed.byGroup[id], onPage: Boolean(CATEGORY_PAGES[id]) };
  }) }));
  const textHome: HomeHeading[] = TEXT_HEADINGS.map(h => ({ ...h, categories: h.groups.map(name => {
    const group = COPY_SCHEMA.find(g => g.group === name);
    return { id: name, title: name, blurb: TEXT_BLURBS[name] || "", changed: group ? changedCopyCount(group.fields, design) : 0 };
  }) }));
  const textChangedTotal = useMemo(() => leftTab === "text" ? COPY_SCHEMA.reduce((n, g) => n + changedCopyCount(g.fields, design), 0) : 0, [leftTab, design]);
  const panelTitle = sidebarTabs.find(([id]) => id === leftTab)?.[1];

  // Media › Where it's used: section names as Page layout shows them; a click opens that section.
  const mediaNames = useMemo(() => ({ surface: surfaceLabel, section: (s: any) => s.label || sectionTitle(s).label }), [templates]);
  const openMediaPlace = (place: UsagePlace) => {
    if (!place.templateId || !place.sectionId) return;
    goToResult({ target: { type: "section", templateId: place.templateId, sectionId: place.sectionId } } as SearchEntry);
  };

  const sidebarPanel = (
        <div className="studio-sidebar" aria-label="Editor panel" role="region">
          <div className="studio-panel-context">
            <strong>{panelTitle}</strong>
            <span>{leftTab === "sections" ? (showGlobal ? `Every page · ${groupLabel(globalGroup)}` : template.label) + ` · ${sections.length} ${sections.length === 1 ? "section" : "sections"}` : `Previewing: ${showGlobal ? groupLabel(globalGroup) : template.label}`}</span>
            <small>{leftTab === "sections" ? "Select content here or click it in the preview." : leftTab === "style" ? "Choose a category or search every setting." : leftTab === "text" ? "Edit the words your shoppers see." : leftTab === "menus" ? "Manage links, categories and their order." : leftTab === "media" ? "Upload images, describe them and see where each is used." : leftTab === "themes" ? "Save, compare, share and switch whole designs." : "Create pages and edit their content or layout."}</small>
          </div>
          <div className="flex-1 overflow-auto" ref={sidebarScrollRef} onScroll={e => { tabScroll.current[leftTab] = e.currentTarget.scrollTop; }}>
            {brandKit && <StudioBrandKit design={design} onPreview={setBrandChoice} onApply={applyBrandKit} onClose={() => setBrandKit(false)} />}
            <div hidden={brandKit}>
            <StudioTips forceOpen={tipsNonce} />
            {leftTab === "sections" && <PreviewClickHint />}
            {leftTab === "sections" && adding !== null && (
              <StudioSectionLibrary registry={SECTION_REGISTRY} design={design}
                surface={showGlobal ? globalGroup : template.id}
                surfaceLabel={showGlobal ? `Every page · ${groupLabel(globalGroup)}` : template.label}
                at={adding} total={sections.length}
                onPreview={setCandidate} onPick={addSection} onPickBestPlace={addSectionBestPlace} onPickPreset={addPreset}
                onDraftPreview={setDraftCandidate} onAddDraft={addDraftedSection} draftOpen={aiDraftOpen}
                onRenamePreset={renamePresetAsk} onDeletePreset={deletePresetNow}
                onRenameShared={renameSharedAsk} onDeleteShared={deleteSharedNow}
                onClose={() => setAdding(null)} />
            )}
            {leftTab === "sections" && adding === null && pickerOwner && (
              <StudioBlockPicker key={blockPicker!} sectionLabel={sectionTitle(pickerOwner.section).label} choices={pickerChoices}
                onPreview={choice => setBlockCandidate(choice ? choice.make() : null)} onPick={addBlockFromPicker}
                onClose={() => setBlockPicker(null)} />
            )}
            {leftTab === "sections" && adding === null && !blockPicker && !showGlobal && (
              <StudioTemplateCard design={design} templateId={template.id} books={books} previewBookSlug={productSlug}
                onSwitch={id => { setTemplateId(id); setSelectedId(null); setBlockId(null); }}
                onPreviewBook={setProductSlug}
                onCreate={createTemplateAsk} onRename={renameTemplateAsk} onDelete={(base, id, name) => {
                  void askConfirm({ title: "Delete this template?", message: `“${name}” will be removed. Books and categories that use it show the default layout instead. You can undo this right after.`, confirmLabel: "Delete template" })
                    .then(ok => { if (ok) deleteTemplateNow(base, id, name); });
                }} />
            )}
            {leftTab === "sections" && adding === null && !blockPicker && !showGlobal && isProductTemplate(template.id) && (
              <StudioProductBlocks design={design} templateId={template.id} change={change}
                onNotice={(text, undoable) => say("ok", text, undoable ? undoAction() : undefined)} />
            )}
            {leftTab === "sections" && adding === null && !blockPicker && template.id === "heroPage" && (
              <div className="m-3 p-3 rounded-lg border border-neutral-200 bg-white text-xs space-y-2">
                <label className="flex items-center justify-between gap-3 font-bold text-sm">
                  Show a Home page
                  <input type="checkbox" role="switch" checked={design.showHero !== false}
                    onChange={(e) => setStyle("showHero", e.target.checked ? undefined : false)} aria-describedby="studio-home-toggle-help" />
                </label>
                <p id="studio-home-toggle-help" className="text-neutral-500">
                  {design.showHero === false
                    ? "Off: your shop opens straight on the catalog. The sections below are kept but not shown."
                    : "On: your shop opens on these sections, with the catalog one click away. Turn off to open straight on the catalog."}
                </p>
              </div>
            )}
            {leftTab === "sections" && adding === null && !blockPicker && (template.id === "page" || template.id.startsWith("page:")) && !sections.some((s) => s.type === "PageContentSection") && (
              <div className="m-3 p-3 rounded-lg border border-neutral-200 bg-white text-xs space-y-2" data-studio-panel="page-content">
                <p className="font-bold text-sm">The page text is fixed at the bottom</p>
                <p className="text-neutral-500">This page's title and text (written in Pages) always sit below every section here, so nothing can go under them. Make them a <b>Page content</b> section, then move it up or down like any other section. The page looks the same until you move it.</p>
                <button className={btn} onClick={() => {
                  const s = makeSection("PageContentSection", getSectionMeta("PageContentSection")?.defaults || {});
                  setList((l) => insertSection(l, s, l.length), { label: "Make page text movable" }); setSelectedId(s.id); setBlockId(null);
                }}>Make page text movable</button>
              </div>
            )}
            {leftTab === "sections" && adding === null && !blockPicker && <div className="studio-section-tools">
              <button className={btn} onClick={() => setAdding(sections.length)}><Plus size={13} /> Add section</button>
              <button className={btn} onClick={() => autoFitPage(false)} title="Works out phone spacing, text sizes, columns and stacked blocks for this page's sections and built-in regions. Anything you set yourself is kept."><Smartphone size={13} /> Auto-fit page for phones</button>
              <div className="studio-tools-menu"><span>Section tools</span><ActionMenu label="Section tools" actions={[
                { label: selected ? "Copy selected section" : "Copy a section (select one first)", icon: <Copy size={14} />,
                  onSelect: () => { if (!selected) { say("ok", "Select a section in the list or the preview first, then copy it."); return; } setCopiedSection(JSON.parse(JSON.stringify(selected))); say("ok", "Section copied. Open any page, then Section tools › Paste copied section."); } },
                { label: copiedSection ? "Paste copied section" : "Paste (nothing copied yet)", icon: <Clipboard size={14} />,
                  onSelect: () => { if (!copiedSection) { say("warn", "Copy a section first with Section tools › Copy selected section."); return; } pasteSection(); } },
                { label: selected ? "Save selected section for reuse" : "Save a section for reuse (select one first)", icon: <Download size={14} />,
                  onSelect: () => { if (!selected) { say("ok", "Select a section first, then save it. Saved sections appear in Add section."); return; } saveSection(selected); } },
              ]} /></div>
            </div>}
            {leftTab === "sections" && adding === null && !blockPicker && <StudioStructure structure={structure} hoverKey={hoverKey} selectedKey={selectedElement?.key || null} deviceLabel={REGION_DEVICE_LABELS[device]}
              pageLabel={template.label} showGlobal={showGlobal} group={globalGroup}
              groupCounts={Object.fromEntries(SECTION_GROUP_KEYS.map(k => [k, Array.isArray(design[k]) ? design[k].length : 0]))}
              onHover={key => postPreview({ type: "HOVER_NODE", key })}
              onOpen={openStructureItem}
              onOpenTarget={(target, label) => openTarget(target, label)}
              onOverlay={overlay => { if (overlay !== "close") setMode("edit"); postPreview({ type: "OPEN_OVERLAY", overlay }); }}
              regionState={regionToggleState} onToggleRegion={toggleRegion}
              onGlobal={group => { setShowGlobal(true); setGlobalGroup(group); setSelectedId(null); setBlockId(null); }}
              onPage={() => { setShowGlobal(false); setSelectedId(null); setBlockId(null); }}>
              <StudioOutline key={showGlobal ? `__group:${globalGroup}` : template.id}
              sections={sections} selectedId={selectedId} blockId={blockId} device={device}
              hoveredId={hoverKey?.startsWith("s:") ? hoverKey.slice(2) : null}
              onHover={id => postPreview({ type: "HOVER_NODE", key: id ? `s:${id}` : null })}
              onRename={renameSection} actions={outlineActions} sharedBlocks={design.sharedBlocks || []} templateId={showGlobal ? "" : template.id}
              onSelect={(id, block) => { setSelectedId(id); setBlockId(block || null); setMobilePanel("settings"); highlight(id, true, block || null); }}
              onReorder={list => setList(() => list)} onPatch={(id, patch) => setList(list => patchSectionSettings(list, id, patch))}
              onAdd={setAdding} onAddBlock={openBlockPicker} onDuplicate={dupSection} onDelete={delSection}
              onToggle={id => setList(list => toggleSection(list, id))} />
            </StudioStructure>}
            {leftTab === "style" && <div className="studio-settings-search">
              <input className="studio-search" aria-label="Search style settings" placeholder="Search colors, fonts, spacing…" value={styleSearch} onChange={e => { setStyleSearch(e.target.value); if (e.target.value) setStyleFocus(null); }} />
              <label>Editing scope<select aria-label="Style scope" value={styleScope} onChange={e => setStyleScope(e.target.value as any)}><option value="all">All pages</option><option value="page" disabled={parseAltSurface(template.id)?.base === "collectionPage"}>This page only: {template.label}</option></select></label>
              {styleSearch && <button className={btn} onClick={() => setStyleSearch("")}>Clear search</button>}
            </div>}
            {leftTab === "style" && !styleSearch.trim() && !styleCategory && !styleFocus && !showGlobal && (
              <StudioPageOverrides design={design} surface={template.id} pageLabel={template.label}
                onUseAll={key => change(d => writeDesignValue(d, key, undefined, { surface: template.id }))}
                onMakeAll={(key, value) => change(d => writeDesignValue(d, key, value, "all"))} />
            )}
            {leftTab === "style" && !styleSearch.trim() && !styleCategory && !styleFocus && (
              <SettingsHome headings={themeHome} map={SHOP_MAP} onOpen={(id) => setStyleCategory(id)} onShowOnPage={showOnPage}
                changedTotal={changed.total} onOpenChanged={() => setStyleCategory(CHANGED_CATEGORY)} />
            )}
            {leftTab === "style" && !styleSearch.trim() && styleCategory && !styleFocus && (() => {
              const group = STYLE_GROUPS.find(g => g.id === styleCategory);
              const extra = EXTRA_STYLE_CATEGORIES[styleCategory];
              const isChangedView = styleCategory === CHANGED_CATEGORY;
              const local = styleScope === "page" && PAGE_STYLE_GROUPS.has(styleCategory);
              const scopeNote = isChangedView ? "Every setting that differs from the default, grouped by category. Reset one to go back to the default."
                : local ? `Changes here apply to this page only (${template.label}). Reset a field to use the all-pages value.`
                : PAGE_STYLE_GROUPS.has(styleCategory) ? "Applies to every page. To change just this page, set Editing scope to “This page only”."
                : "Applies to every page.";
              const subs = group ? subsectionsFor(group) : [];
              return (
                <div data-studio-panel={`style:${styleCategory}`}>
                  <CategoryHeader title={isChangedView ? "What I've changed" : extra?.title || group?.title || styleCategory}
                    blurb={isChangedView ? undefined : blurbFor(group, styleCategory)} backLabel="All theme settings"
                    onBack={() => setStyleCategory(null)} extra={<p className="studio-scope-note">{scopeNote}</p>} />
                  {styleCategory === "themeLook" && <div className="px-4 pb-4 space-y-4">
                    <button type="button" className={`${btn} w-full justify-center`} onClick={() => setLeftTab("themes")}>Open Themes (thumbnails, preview, share links)</button>
                    <p className="studio-hint">Current look: {design.themeLibraryPreset === RISO_NOIR_ID ? "Riso Noir" : riso ? "Riso Press" : "Standard / custom"}. One click sets every colour, font and print detail; you can still change each one afterwards.</p>

                <button type="button" className={`${btnPrimary} w-full justify-center`} onClick={applyNoirLook}>Apply Riso Noir (black &amp; white)</button>
                <button type="button" className={`${btn} w-full justify-center`} onClick={installNoirHome}>Also install the Noir homepage layout</button>
                <button type="button" className={`${btn} w-full justify-center`} disabled={!riso} onClick={() => setStyle("themeStyle", "default")}>Turn off Riso print style</button>
                <div className="pt-2 border-t border-neutral-200 space-y-2">
                  <p className="text-[10px] font-black tracking-widest uppercase text-neutral-500">My themes</p>
                  <button type="button" className={`${btn} w-full justify-center`} onClick={saveCurrentAsTheme}>Save current design as a theme…</button>
                  <label className={`${btn} w-full justify-center cursor-pointer`}>
                    <Upload size={14} /> Import a theme file…
                    <input type="file" accept="application/json,.json" className="sr-only" aria-label="Import a theme file"
                      onChange={(e) => { importTheme(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {savedThemes.map((t) => (
                    <div key={t.id} className="flex items-stretch gap-1">
                      <button type="button" onClick={() => applySavedTheme(t)} className="flex-1 text-left border border-neutral-200 rounded-lg px-3 py-2 hover:bg-neutral-50">
                        <span className="block text-xs font-bold">{t.name}</span>
                        <span className="block text-[11px] text-neutral-500">Saved {new Date(t.savedAt).toLocaleDateString()}</span>
                      </button>
                      <button type="button" aria-label={`Rename ${t.name}`} title="Rename" className={iconBtn} onClick={() => renameTheme(t)}><Pencil size={14} /></button>
                      <button type="button" aria-label={`Duplicate ${t.name}`} title="Duplicate" className={iconBtn}
                        onClick={() => duplicateTheme(t)}><Copy size={14} /></button>
                      <button type="button" aria-label={`Download ${t.name} as a file`} title="Download file" className={iconBtn} onClick={() => exportTheme(t)}><Download size={14} /></button>
                      <button type="button" aria-label={`Delete ${t.name}`} className={iconBtn}
                        onClick={() => { void askConfirm({ title: "Delete saved theme?", message: `“${t.name}” will be removed from My themes. This can't be undone.`, confirmLabel: "Delete theme" }).then(ok => { if (ok) persistThemes(removeSavedTheme(savedThemes, t.id), "Theme deleted."); }); }}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-neutral-200 space-y-2">
                  <p className="text-[10px] font-black tracking-widest uppercase text-neutral-500">Theme library</p>
                  {THEME_LIBRARY.map((t: any) => (
                    <button key={t.id} type="button" onClick={() => applyLibraryTheme(t)}
                      className="w-full text-left border border-neutral-200 rounded-lg px-3 py-2 hover:bg-neutral-50">
                      <span className="block text-xs font-bold">{t.name}{design.themeLibraryPreset === t.id ? "  ✓ current" : ""}</span>
                      <span className="block text-[11px] text-neutral-500">{t.mood}</span>
                    </button>
                  ))}
                </div>
                  </div>}
                  {styleCategory === "header" && <div className="px-4 pb-4">
                    <StudioAnnouncements design={design} change={change}
                      onNotice={(text, canUndo) => say("ok", text, canUndo ? undoAction() : undefined)} />
                  </div>}
                  {styleCategory === "tokens" && <div className="px-4 pb-4"><StudioScalePreview design={design} /></div>}
                  {styleCategory === "schemes" && <div className="px-4 pb-4">
                    <StudioColorSchemes design={design} change={change} confirm={askConfirm}
                      onNotice={(text, canUndo) => say("ok", text, canUndo ? undoAction() : undefined)} />
                  </div>}
                  {styleCategory === "paymentIcons" && <div className="px-4 pb-4 space-y-4">
                    <p className="studio-hint">Checkout itself always offers the methods enabled in Settings › Payments.</p>

                {PAYMENT_BADGE_OPTIONS.map((o) => {
                  const cur = resolveFooterBadges(design, settings);
                  const on = cur.includes(o.id);
                  return (
                    <label key={o.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={on}
                        onChange={() => setStyle("footerBadges", on ? cur.filter((x: string) => x !== o.id) : [...cur, o.id])} />
                      {o.label}
                    </label>
                  );
                })}
                <button type="button" className={btn} onClick={() => setStyle("footerBadges", undefined)}>Reset to Settings › Payments</button>
                  </div>}
                  {isChangedView && <div className="studio-changed-list">
                    {!changed.total && <p className="studio-empty">Nothing changed yet. Every theme setting uses its default.</p>}
                    {STYLE_GROUPS.filter(g => changed.byGroup[g.id]).map(g => (
                      <section key={g.id} className="studio-subsection">
                        <div className="studio-changed-group"><strong>{g.title}</strong>
                          <button type="button" className="studio-reset" onClick={() => setStyleCategory(g.id)}>Open category</button></div>
                        <div className="studio-subsection-body">{changedFields(g, design, defaults).map(f => renderStyleField(g, f))}</div>
                      </section>
                    ))}
                  </div>}
                  {group && (REGION_GROUPS.some(r => r.id === group.id)
                    ? <div className="px-4 pb-4"><StudioRegionBrowser groupId={group.id} fields={group.fields} device={device}
                        values={{ ...design.regions, ...(local ? design[template.id]?.regions : {}) }} onPick={openRegion} /></div>
                    : subs.map((sub, i) => (
                      <SettingsSubsection key={sub.title || i} title={sub.title} count={sub.fields.length}
                        changed={sub.fields.filter(f => isChanged(f, design, defaults)).length}
                        defaultOpen={i === 0 || subs.length <= 2} keys={sub.fields.map(f => f.key)} focusKey={fieldFocus}>
                        {sub.fields.map(f => renderStyleField(group, f))}
                      </SettingsSubsection>
                    )))}
                </div>
              );
            })()}
            {leftTab === "style" && styleFocus && !styleSearch && (() => {
              const focusGroup = STYLE_GROUPS.find(g => g.id === styleFocus.id)!;
              const pattern = STYLE_TARGET_FIELDS[styleFocus.label];
              const regionGroup = REGION_GROUPS.find(g => g.id === styleFocus.id);
              const region = regionGroup?.regions.find(r => r.label === styleFocus.label);
              // A part that spans several elements (the cookie banner) lists them to pick from.
              if (regionGroup && !region) return <div data-studio-panel="style-focus"><Group title={regionGroup.title} open>
                <StudioRegionBrowser groupId={regionGroup.id} fields={focusGroup.fields} device={device}
                  values={{ ...design.regions, ...(styleScope === "page" ? design[template.id]?.regions : {}) }} onPick={openRegion} />
              </Group></div>;
              const pickedAll = region ? regionStyleFields(focusGroup, region.id).map(f => ({ g: focusGroup, f })) : pattern
                ? STYLE_GROUPS.flatMap(g => g.fields.filter(f => pattern.test(f.key)).map(f => ({ g, f })))
                : focusGroup.fields.map(f => ({ g: focusGroup, f }));
              const picked = region ? pickedAll.filter(({ f }) => regionFieldDevice(f.key) === device) : pickedAll;
              return (
                <div className="border-b border-neutral-200 bg-neutral-50" data-studio-panel="style-focus">
                  <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black tracking-widest uppercase text-neutral-500">Editing element</p>
                      <p className="text-sm font-bold">{styleFocus.label}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{picked.length} settings for this element{styleScope === "page" ? "" : " · all pages"}</p>
                    </div>
                    <button type="button" className={btn} onClick={() => setStyleFocus(null)}>{(() => {
                      // Back to the category the owner came from (its element list), else the Theme settings home.
                      const from = styleCategory && (EXTRA_STYLE_CATEGORIES[styleCategory]?.title || STYLE_GROUPS.find(g => g.id === styleCategory)?.title);
                      return from ? `Back to ${from}` : "Back to theme settings";
                    })()}</button>
                  </div>
                  <div className="px-4 pb-4 space-y-4">
                    {region && <div className="studio-region-context">
                      <p>{REGION_DEVICE_LABELS[device]} · {styleScope === "page" ? template.label : "All pages"}</p>
                      <p className="studio-hint">{device === "desktop" ? "Base styling for all sizes. Tablet and phone overrides take precedence." : "Blank values inherit from larger sizes. Changes apply at this size and smaller unless overridden."}</p>
                      <div className="studio-region-actions">
                        <button type="button" className="studio-reset" onClick={() => resetRegion(styleFocus.id, region.id)}>Reset {REGION_DEVICE_LABELS[device].toLowerCase()} styling</button>
                        <button type="button" className="studio-reset" onClick={() => {
                          setTextCategory(region.copy || regionGroup!.copy); setCopyFilter(""); setStyleFocus(null); setLeftTab("text");
                        }}>Edit words in Text &amp; labels</button>
                      </div>
                    </div>}
                    {picked.map(({ g, f }) => renderStyleField(g, f))}
                  </div>
                </div>
              );
            })()}
            {leftTab === "style" && !styleFocus && styleSearch.trim() && visibleStyleGroups.map(g => {
              const fields = g.fields;
              if (!fields.length) return null;
              const local = styleScope === "page" && PAGE_STYLE_GROUPS.has(g.id);
              return <Group key={g.id} id={`style:${g.id}`} title={g.title} hint={local ? "This page only. Reset a field to inherit its global value." : "All pages"} open={Boolean(styleSearch || styleCategory)}>
                {REGION_GROUPS.some(group => group.id === g.id)
                  ? <StudioRegionBrowser groupId={g.id} fields={fields} device={device}
                    values={{ ...design.regions, ...(local ? design[template.id]?.regions : {}) }} onPick={openRegion} />
                  : fields.map(f => renderStyleField(g, f))}
              </Group>;
            })}
            {leftTab === "style" && styleSearch && !STYLE_GROUPS.some(g => g.fields.some(f => (g.title + " " + f.label + " " + f.key).toLowerCase().includes(styleSearch.toLowerCase()))) && <p className="studio-empty">No matching settings.</p>}

            {leftTab === "text" && (
              <div>
                <div className="p-3 border-b">
                  <input value={copyFilter} onChange={(e) => setCopyFilter(e.target.value)} placeholder="Search any label or message…"
                    aria-label="Search text" className="w-full h-9 border border-neutral-300 rounded-lg px-3 text-xs" />
                </div>
                {!q && !textCategory && <SettingsHome headings={textHome} onOpen={(id) => setTextCategory(id)}
                  changedTotal={textChangedTotal} changedNoun="label" onOpenChanged={() => setTextCategory(CHANGED_CATEGORY)} />}
                {!q && textCategory && <CategoryHeader title={textCategory === CHANGED_CATEGORY ? "Text I've changed" : textCategory}
                  blurb={textCategory === CHANGED_CATEGORY ? "Every label you rewrote. Reset one to go back to the default wording." : TEXT_BLURBS[textCategory]}
                  backLabel="All text categories" onBack={() => setTextCategory(null)} />}
                {!q && textCategory === CHANGED_CATEGORY && <div className="studio-changed-list">
                  {!textChangedTotal && <p className="studio-empty">No labels changed yet. Every word uses its default.</p>}
                  {COPY_SCHEMA.filter(g => changedCopyCount(g.fields, design)).map(g => (
                    <section key={g.group} className="studio-subsection">
                      <div className="studio-changed-group"><strong>{g.group}</strong>
                        <button type="button" className="studio-reset" onClick={() => setTextCategory(g.group)}>Open category</button></div>
                      <div className="studio-subsection-body">{g.fields.filter(f => typeof design.copy?.[f.key] === "string").map(f => <StudioCopyField key={f.key} field={f} design={design} settings={settings} aiWhere={g.group}
                        onChange={value => setCopy(f.key, value)} />)}</div>
                    </section>
                  ))}
                </div>}
                {q && !COPY_SCHEMA.some(g => g.fields.some(f => `${f.label} ${g.group} ${f.default} ${f.key}`.toLowerCase().includes(q))) && <p className="studio-empty">No matching text. Try a shorter word or clear search.</p>}
                {COPY_SCHEMA.map((g) => {
                  if (!q && g.group !== textCategory) return null;
                  const fs = g.fields.filter((f) => !q || `${f.label} ${g.group} ${f.default} ${f.key}`.toLowerCase().includes(q));
                  if (!fs.length) return null;
                  const fieldsList = fs.map(f => <StudioCopyField key={f.key} field={f} design={design} settings={settings} aiWhere={g.group}
                    onChange={value => setCopy(f.key, value)} />);
                  if (!q) return <div key={g.group} data-studio-panel={`copy:${g.group}`} className="px-4 pb-4 space-y-4">
                    {textSubsectionsFor(g).map((sub, i, all) => <SettingsSubsection key={sub.title || "all"} title={all.length > 1 ? sub.title : ""} noun="word"
                      /* Opens the short list holding the word being focused or searched for; otherwise the first one. */
                      count={sub.fields.length} changed={changedCopyCount(sub.fields, design)} keys={sub.fields.map(f => f.key)} focusKey={fieldFocus}
                      defaultOpen={(() => { const at = fieldFocus ? all.findIndex(x => x.fields.some(f => f.key === fieldFocus.key)) : -1; return at >= 0 ? i === at : i === 0; })()}>
                      {sub.fields.map(f => <StudioCopyField key={f.key} field={f} design={design} settings={settings} aiWhere={g.group} onChange={value => setCopy(f.key, value)} />)}
                    </SettingsSubsection>)}
                  </div>;
                  return (
                    <Group key={g.group} id={`copy:${g.group}`} title={g.group} open>
                      {fieldsList}
                    </Group>
                  );
                })}
              </div>
            )}

            <div hidden={leftTab !== "pages"}>
              <StudioPages pages={pages} setPages={setPages} say={say} onDraft={setDraftPage} onShow={showPageInPreview} openSlug={openPage} onBusy={setPageBusy}
                loadError={pageLoadError} onRetryLoad={loadPages}
                active={leftTab === "pages"}
                formatTitle={pageTitleFormat} fillSeoRequest={fillSeoRequest}
                onAddressChange={async (from, to, wasPublished) => {
                  const notes: string[] = [];
                  const links = menuLinksTo(designRef.current.menus, from);
                  if (links) {
                    change((d) => applyGlobalStyle(d, "menus", renamePageInMenus(d.menus, from, to), surfaceIds), { label: `Point menu links at /page/${to}` });
                    notes.push(`${links} menu link${links === 1 ? " now points" : "s now point"} to the new address (Publish to update the shop menu).`);
                  }
                  if (wasPublished) {
                    const next = redirectsAfterRename(await adminApi.getRedirects(), from, to);
                    if (next) { await adminApi.saveRedirects(next); notes.push(`/page/${from} now forwards to /page/${to}.`); }
                  }
                  return notes.join(" ");
                }}
                onReorder={(ordered) => {
                  const raw: any[] = Array.isArray(design.categories) ? design.categories : [...CATEGORIES];
                  const cats = raw.map((c, i) => (typeof c === "string" ? { id: `cat-${i}`, name: c, description: "", showInNav: true } : c));
                  setStyle("navOrder", reslotPages(buildNavItems(cats, ordered, design.navOrder), ordered));
                }}
                onEditSections={(slug) => { setShowGlobal(false); setTemplateId(`page:${slug}`); setSelectedId(null); setLeftTab("sections"); }} />
            </div>

            {leftTab === "themes" && (
              <StudioThemes design={design} published={published} unpublished={unpublished || dirtyDraft} savedThemes={savedThemes}
                presets={THEME_LIBRARY as any[]} currentPresetId={design.themeLibraryPreset}
                previewingId={themePreview?.id || null} onPreview={setThemePreview}
                onSaveCurrent={saveCurrentAsTheme} onImport={file => importTheme(file)}
                onLoad={t => { setThemePreview(null); applySavedTheme(t); }} onPublish={publishSavedTheme}
                onRename={renameTheme} onDuplicate={duplicateTheme}
                onDownload={exportTheme} onSchedule={t => setSchedule({ themeId: t.id })}
                onDelete={t => { void askConfirm({ title: "Delete saved theme?", message: `“${t.name}” will be removed from My themes. This can't be undone.`, confirmLabel: "Delete theme" }).then(ok => { if (ok) persistThemes(removeSavedTheme(savedThemes, t.id), "Theme deleted."); }); }}
                onApplyPreset={preset => { setThemePreview(null); applyLibraryTheme(preset); }}
                links={{ create: (d, name, days) => adminApi.createPreviewLink(d, name, days), list: () => adminApi.listPreviewLinks(), revoke: token => adminApi.revokePreviewLink(token) }}
                askConfirm={askConfirm} say={(kind, text) => say(kind, text)} />
            )}

            {leftTab === "media" && (
              <StudioMediaPanel lib={mediaLib} design={design} published={published} pages={pages} names={mediaNames}
                savedThemes={savedThemes} getVersions={fetchVersions} getStoredDesigns={fetchStoredDesigns}
                onDesignChange={(fn, label) => change(fn, { label })}
                onOpenPlace={openMediaPlace}
                onOpenPage={slug => { setLeftTab("pages"); setOpenPage({ slug, nonce: Date.now() }); }}
                say={say} askConfirm={askConfirm} />
            )}

            {leftTab === "menus" && (
              <>
                <StudioCategories design={design} published={published} confirm={askConfirm} onChange={(c) => setStyle("categories", c)}
                  onReorder={(c) => change(d => ({ ...d, categories: c, navOrder: categoryNavOrder(d.categories ?? [...CATEGORIES], c, pages, d.navOrder) }))}
                  onBooksChanged={(all) => setBooks(all.filter(b => b.status === "published" || !b.status))} />
                <NavOrderPanel design={design} pages={pages} onChange={(o) => setStyle("navOrder", o)} onSecondaryChange={(keys) => setStyle("secondaryNavKeys", keys)} />
                <MenusPanel design={design} settings={settings} pages={pages} onChange={(m) => setStyle("menus", m)}
                  onRemove={(m, label) => {
                    change((d) => applyGlobalStyle(d, "menus", m, surfaceIds), { label: `Remove menu link “${label}”` });
                    say("warn", `Removed “${label}” from the menu.`, undoAction());
                  }} />
              </>
            )}
            </div>
          </div>
        </div>
  );
  // ── Workbench (3.0 phase 1) ──
  const changeRows = useMemo((): ChangeRow[] => {
    const past = hist.pastLabels ?? hist.past.map(() => "Edit");
    const future = hist.futureLabels ?? hist.future.map(() => "Edit");
    const start = hist.past.length >= HISTORY_LIMIT ? "Earliest step kept" : "Where you started";
    return [start, ...past, ...future].map((label, i) => ({ label, state: i < past.length ? "past" : i === past.length ? "current" : "future" }));
  }, [hist]);
  const jumpHistory = (steps: number) => {
    setHist(h => jumpBy(h, steps));
    setToast(t => t?.action?.expect ? null : t);
  };
  const changesOpen = !narrow && workbench.open && workbench.tab === "changes";
  const deferredDesign = useDeferredValue(design);
  const sinceLive = useMemo(() => changesOpen ? summariseDiff(diffDesigns(normalizeForDiff(published), normalizeForDiff(deferredDesign), diffContext)) : null,
    [changesOpen, published, deferredDesign, normalizeForDiff, diffContext]);
  const setupItems = useMemo(() => setupChecklist({
    design, defaults, policies: settings?.policies, phoneChecked: phoneSeen, healthIssues, siteIssues: site.history.length && site.history[site.history.length - 1].failed === 0 ? site.history[site.history.length - 1].issues : null,
    published: settings?.design || publishedNow ? published : null,
  }), [design, defaults, settings, phoneSeen, healthIssues, site.history, publishedNow, published]);
  const goSetup = (item: SetupItem) => {
    const go = item.go;
    if (!go) return;
    if (go.kind === "target") openTarget(go.target, item.title);
    else if (go.kind === "tab") selectRail(go.tab);
    else if (go.kind === "device") { setDevice(go.device); setMobilePanel("preview"); }
    else if (go.kind === "health") openHealth();
    else if (go.kind === "brand") openBrandKit();
    else if (go.kind === "publish") {
      if (!unpublished && !dirtyDraft) say("ok", "Make a change first: there's nothing new to publish.");
      else setConfirmAction("publish");
    }
  };
  const workbenchPanel = !narrow && (
    <StudioWorkbench open={workbench.open} tab={workbench.tab}
      onOpen={openWorkbench} onCollapse={() => setWorkbench(w => ({ ...w, open: false }))}
      healthIssues={healthIssues}
      health={<HealthFindings run={runHealth} runKey={healthRun + 1} onResult={setHealthIssues}
        pageLabel={showGlobal ? `Every page · ${groupLabel(globalGroup)}` : template.label} deviceLabel={REGION_DEVICE_LABELS[device].toLowerCase()}
        designResults={workbench.open && workbench.tab === "health" ? [...designChecks(design), designSize(design)] : []} onShow={showFinding} onFix={fixFinding} site={sitePanel} />}
      changes={{ rows: changeRows, onJump: jumpHistory, sinceLive, blocked: inlineEditing ? "Finish the text edit in the preview first" : null }}
      setup={{ items: setupItems, onGo: goSetup }} />
  );
  const canvasPanel = (
        <main className="studio-canvas">
          <div className="studio-canvas-status"><span>{template.label} · {device} ({canvasWidth}px) · {mode === "edit" ? "Double-click text to type · click other elements for settings" : "Browse your storefront"}</span>{linkHint && mode === "edit" && <span role="status" data-studio-link-hint>Links don't open while you're editing. Use Switch to Browse mode to follow them.</span>}<span role="status">{previewStatus === "loading" ? "Loading preview…" : previewStatus === "error" ? "Preview unavailable" : "Preview connected"}</span>{previewStatus === "error" && <button className={btn} onClick={() => setPreviewRevision(r => r + 1)}>Retry preview</button>}
            {device === "desktop" && <label className="studio-zoom">Screen width<select aria-label="Desktop preview screen width" value={String(desktopWidth)} onChange={e => setDesktopWidth(Number(e.target.value) as DesktopWidth)}>
              {DESKTOP_WIDTHS.map(w => <option key={w} value={w}>{DESKTOP_WIDTH_LABELS[w]}</option>)}</select></label>}
            <label className="studio-zoom">Zoom<select aria-label="Preview zoom" value={String(zoom)} onChange={e => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value) as Zoom)}>
              <option value="fit">Fit to screen</option><option value="100">100%</option><option value="75">75%</option><option value="50">50%</option></select></label></div>
          {template.id === "productPage" && !books.some(b => b.slug === productSlug) ? <p className="studio-empty">Choose a book in “Page to edit” to preview this template.</p> :
          <StudioPreviewFrame deviceWidth={canvasWidth} zoom={zoom} loading={previewStatus === "loading"} loadingText="Loading your shop preview…">
            <iframe ref={iframeRef} key={previewUrl + previewRevision} src={previewUrl} title="Live preview" onLoad={onIframeLoad} className="w-full h-full border-0" />
          </StudioPreviewFrame>}
          {workbenchPanel}
        </main>
  );
  const inspectorPanel = selected && (
          <StudioInspector section={selected} blockId={blockId} onSelectBlock={setBlockId} colorSchemes={colorSchemes}
            device={device} sharedBlocks={design.sharedBlocks || []} onSaveShared={saveSharedBlock} onPatchShared={patchSharedBlock} onInsertShared={insertSharedBlock}
            onAddBlock={() => openBlockPicker(selected.id)} onCopyBlock={id => copyBlockNow(selected, id)}
            canPasteBlock={canPasteBlock(copiedBlock, selected?.type)} onPasteBlock={afterId => pasteBlockNow(selected, afterId)}
            onPatch={patchSelected} onDuplicate={() => dupSection(selected.id)} onDelete={() => delSection(selected.id)}
            onToggle={() => setList((l) => toggleSection(l, selected.id))} onNotice={(text) => say("ok", text)}
            onMoveSection={moveSelectedSection} sectionRoom={(() => { const i = sections.findIndex(x => x.id === selected?.id); return { up: i > 0, down: i >= 0 && i < sections.length - 1 }; })()}
            onReplayMotion={() => { setMode("edit"); postPreview({ type: "HIGHLIGHT_SECTION", instanceId: selected.id, blockId: null, scroll: true }); setTimeout(() => postPreview({ type: "MOTION_REPLAY", sectionId: selected.id }), 450); }}
            arranging={arrangeId === selected?.id} onArrange={on => { setArrangeId(on ? selected.id : null); if (on) setMode("edit"); }} onClose={() => { setSelectedId(null); setBlockId(null); setMobilePanel("preview"); }} />
  );

  const inspectorEmpty = (
          <div className="studio-inspector-empty" role="note">
            <strong>Nothing selected</strong>
            <span>Click any part of the preview, or pick it under Page layout, to edit its words, style and layout here.</span>
          </div>
  );

  const selectedTabs = useMemo(() => selectedElement ? elementTabs(selectedElement, device, design) : null, [selectedElement, device, design]);
  const elementPanel = selectedElement && selectedTabs && (
          <StudioElementInspector element={selectedElement} path={structurePath(structure, selectedElement.key)} tabs={selectedTabs} design={design} settings={settings}
            deviceLabel={REGION_DEVICE_LABELS[device]} scope={styleScope} pageLabel={template.label} onScope={setStyleScope}
            renderField={({ group, field }) => renderStyleField(group, field)}
            onCopy={(key, value) => setCopy(key, value)}
            onOpenTheme={() => openElementInTheme(selectedElement)}
            onOpenText={group => { setCopyFilter(""); setTextCategory(group); setLeftTab("text"); setMobilePanel("outline"); }}
            onOpenTarget={target => openTarget(target, selectedElement.label, true)}
            onBack={() => { setSelectedElement(null); postPreview({ type: "SELECT_NODE", key: null }); setLeftTab("sections"); setStyleFocus(null); setMobilePanel("outline"); }}
            onClose={closeElement} />
  );

  return (
    <StudioPickerProvider value={pickerData}>
    <DynamicSourcesContext.Provider value={dynamicSourcesValue}>
    <StudioAiContext.Provider value={aiValue}>
    <div className="rp studio-editor" data-rp-appearance={appearance} data-studio-editor data-mobile-panel={mobilePanel}>
      {/* top bar */}
      <header className="studio-topbar">
        <button className={btn} disabled={Boolean(inlineEditing)} onClick={exit}><ArrowLeft size={14} /> Exit</button>
        <strong className="studio-title">Design studio</strong>
        <button className={btn} onClick={() => setFindOpen(true)} aria-label="Find anything (Ctrl+K)" title="Find any setting, word, page, section or action"><Search size={14} /> Find <kbd aria-hidden="true">Ctrl K</kbd></button>
        <TemplatePicker options={pickerList} current={pickerCurrent} onPick={pickPage} />
        <div className="flex items-center gap-0.5" role="group" aria-label="Preview size">
          {([["desktop", Monitor, "Computer"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Phone"]] as const).map(([d, Icon, name]) => (
            <button key={d} className={`${iconBtn} ${device === d ? "bg-neutral-900 text-white hover:bg-neutral-900" : ""}`}
              onClick={() => setDevice(d)} aria-label={`${name} preview`} title={`${name} preview`} aria-pressed={device === d}><Icon size={15} /></button>
          ))}
        </div>
        <button className={btn} aria-pressed={mode === "browse"} onClick={() => setMode(m => m === "edit" ? "browse" : "edit")}
          title={mode === "edit" ? "You are in Edit mode: clicking the preview selects parts to edit. Click to switch to Browse mode, where links and buttons work like on the shop." : "You are in Browse mode: links and buttons work like on the shop. Click to switch to Edit mode and select parts to edit."}>
          {mode === "edit" ? <Globe size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />} {mode === "edit" ? "Switch to Browse mode" : "Switch to Edit mode"}</button>

        <button className={iconBtn} disabled={Boolean(inlineEditing) || !hist.past.length} onClick={() => stepHistory("undo")} aria-label="Undo (Ctrl+Z)" title={hist.past.length ? `Undo: ${undoLabel(hist)} (Ctrl+Z)` : "Nothing to undo"}><Undo2 size={15} /></button>
        <button className={iconBtn} disabled={Boolean(inlineEditing) || !hist.future.length} onClick={() => stepHistory("redo")} aria-label="Redo (Ctrl+Shift+Z)" title={hist.future.length ? `Redo: ${redoLabel(hist)} (Ctrl+Shift+Z or Ctrl+Y)` : "Nothing to redo"}><Redo2 size={15} /></button>
        <div className="flex-1" />
        {/* Two short lines keep the bar on one row; the text still reads "Not saved yet · shop unchanged". */}
        <span className="studio-status text-xs px-2 py-1 rounded-full bg-neutral-100" role="status" data-studio-status={dirtyDraft ? "unsaved" : unpublished ? "draft" : "live"}
          title={statusTitle}>
          <strong>{dirtyDraft ? "Not saved yet" : unpublished ? "Saved as draft" : "Live"}</strong><span className="studio-status-sep"> · </span><span>{dirtyDraft || unpublished ? "shop unchanged" : "the shop shows this"}</span>
        </span>
        <div className="studio-tools-menu"><span>Theme actions</span><ActionMenu label="Theme actions" actions={[
          { label: "Version history", icon: <History size={14} />, onSelect: () => { setHistoryOpen(true); loadVersions(); } },
          { label: "Brand kit…", icon: <Sparkles size={14} />, onSelect: openBrandKit },
          { label: "Schedule publishing…", icon: <Clock size={14} />, onSelect: () => setSchedule({ themeId: null }) },
          { label: "Studio Health", icon: <ShieldCheck size={14} />, onSelect: openHealth },
          ...(!narrow ? [{ label: workbench.open ? "Close the Workbench" : "Open the Workbench", icon: <ListChecks size={14} />, onSelect: () => (workbench.open ? setWorkbench(w => ({ ...w, open: false })) : openWorkbench(workbench.tab)) }] : []),
          { label: "Show Studio tips", onSelect: () => setTipsNonce(n => n + 1) },
          ...(unpublished && busy === null && !inlineEditing ? [{ label: "Discard saved draft…", tone: "danger" as const, onSelect: () => setConfirmAction("discard") }] : []),
        ]} /></div>
        <button className={btn} onClick={openPreviewTab} data-studio-view-website
          title={dirtyDraft ? "Open your shop in a new tab with all your changes, including ones not saved yet. Shoppers still see the live shop until you Publish." : unpublished ? "Open your shop in a new tab with your saved draft. Shoppers still see the live shop until you Publish." : "Open your shop in a new tab. It matches the live shop: nothing is waiting to be published."}>
          <Eye size={14} aria-hidden="true" /> View website</button>
        <button className={btn} disabled={Boolean(inlineEditing) || !dirtyDraft || busy !== null} onClick={saveDraft}
          title={inlineEditing ? "Finish the text edit first" : !dirtyDraft ? "Nothing new to save" : "Save your changes without putting them on the shop"}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
        <button className={btnPrimary} disabled={Boolean(inlineEditing) || (!unpublished && !dirtyDraft) || busy !== null} onClick={() => setConfirmAction("publish")}
          title={inlineEditing ? "Finish the text edit first" : !unpublished && !dirtyDraft ? "No changes to publish yet: the shop already shows this design" : "Review and put your changes on the live shop"}>{busy === "publish" ? "Publishing…" : "Publish"}</button>
      </header>

      <StudioBreadcrumb
        crumbs={placeCrumbs(place, placeLabels).map(c => ({ label: c.label, onSelect: crumbAction(c.level) }))}
        onBack={goBackPlace} canBack={placeHist.back.length > 0}
        backTitle={backTarget ? `Back to ${describePlace(backTarget, placeLabels)} (Alt+←)` : "Nothing to go back to yet. Back returns you to where you were before your last jump (Alt+←)"} />
      <div className="studio-mobile-tabs" role="tablist" aria-label="Studio workspace">{[["outline", "Sections"], ["preview", "Preview"], ["settings", "Edit"]].map(([panel, name]) => <button key={panel} role="tab" aria-selected={mobilePanel === panel} onClick={() => setMobilePanel(panel)}>{name}</button>)}</div>
      {inlineEditing && <div className="studio-inline-status" role="status">Editing {inlineEditing} in the preview. Finish the text edit or release the spacing handle to keep it; Escape cancels.</div>}
      {recovery && <div className="studio-recovery" role="status"><span>Local edits from {new Date(recovery.savedAt).toLocaleString()}.{recovery.conflict ? " The server draft has changed; recovering will load your local version as unsaved edits." : " Recover your unsaved work?"}</span><SecondaryButton onClick={recover}>Recover local changes</SecondaryButton><SecondaryButton onClick={() => { void askConfirm({ title: "Discard local edits?", message: "The unsaved edits kept on this device will be deleted. This can't be undone.", confirmLabel: "Discard local edits" }).then(ok => { if (ok) dismissRecovery(); }); }}>Discard local recovery</SecondaryButton></div>}
      {liveSyncPaused && <div className="studio-recovery" role="status" data-studio-live-sync-paused><span>Live updates from other tabs are paused. Reload Studio before publishing to be safe.</span></div>}
      {themePreview && <div className="studio-recovery studio-incoming" role="status" data-studio-theme-preview>
        <span>Previewing “{themePreview.label}” in the canvas. Your draft hasn't changed.</span>
        <SecondaryButton size="sm" onClick={() => setThemePreview(null)}>Stop preview</SecondaryButton>
      </div>}
      {incoming && <div className="studio-recovery studio-incoming" role="status" data-studio-incoming>
        <span>
          {incoming.remote.published ? "This design was published" : "This design was saved"} in another tab or device{incoming.remote.updatedAt ? ` at ${new Date(incoming.remote.updatedAt).toLocaleTimeString()}` : ""}.{" "}
          {incoming.paths.length
            ? <>You both changed {incoming.paths.slice(0, 3).map(path => conflictLabel(path, templates)).join(", ")}{incoming.paths.length > 3 ? ` and ${incoming.paths.length - 3} more` : ""}. Bringing their changes in keeps your edit for those.</>
            : "Your unsaved edits are to other settings, so both can be kept."}
        </span>
        <PrimaryButton size="sm" onClick={() => resolveIncoming("combine")}>{incoming.paths.length ? "Bring in theirs, keep mine" : "Bring in their changes"}</PrimaryButton>
        <SecondaryButton size="sm" onClick={async () => {
          const ok = await askConfirm({ title: "Use their version?", message: "Your unsaved edits in this tab will be replaced by the version saved in the other tab or device. To keep a copy first, use Theme actions › Version history › Save checkpoint.", confirmLabel: "Use their version" });
          if (ok) resolveIncoming("theirs");
        }}>Use their version</SecondaryButton>
        <SecondaryButton size="sm" onClick={() => resolveIncoming("later")}>Later</SecondaryButton>
      </div>}
      {draftPage && leftTab !== "pages" && <div className="studio-recovery" role="status"><span>{pageBusy ? "Saving" : "Unsaved edits to"} page “{draftPage.title || draftPage.slug || "Untitled"}”. {pageBusy ? "Wait for the save to finish." : "Return to Pages to review and save it."}</span>{!pageBusy && <SecondaryButton onClick={() => setLeftTab("pages")}>Return to Pages</SecondaryButton>}</div>}
      {toast && (
        <div role={toast.kind === "err" ? "alert" : "status"} data-studio-toast={toast.kind}
          // A message that is being read stays up: it waits while the pointer or keyboard focus is on it.
          onMouseEnter={() => { toastHeld.current.hover = true; clearTimeout(toastTimer.current); }}
          onFocus={() => { toastHeld.current.focus = true; clearTimeout(toastTimer.current); }}
          onMouseLeave={() => { toastHeld.current.hover = false; if (toast.kind === "ok") armToast(toast.id, 2000); }}
          onBlur={e => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; toastHeld.current.focus = false; if (toast.kind === "ok") armToast(toast.id, 2000); }}
          className={`studio-toast absolute top-16 left-1/2 -translate-x-1/2 z-[350] px-4 py-2 rounded-lg text-sm font-bold shadow-lg ${toast.kind === "err" ? "bg-red-600 text-white" : toast.kind === "warn" ? "studio-toast-warn" : "bg-neutral-900 text-white"}`}>
          {toast.text}
          {toast.action && <button className="ml-3 underline" onClick={() => { const action = toast.action!; setToast(null); action.run(); }}>{toast.action.label}</button>}
          {toast.kind !== "ok" && <button className="ml-3 underline" onClick={() => setToast(null)}>Dismiss</button>}
        </div>
      )}

      <CopyTargetContext.Provider value={openTarget}>
      <MediaPickerContext.Provider value={mediaLib.pickerApi}>
      <FocusContext.Provider value={focus}>
      <div className="studio-workspace" {...inertWhen(busy === "discard")}>
        <StudioRail active={leftTab} onSelect={selectRail} />
        {narrow ? <>
          {sidebarPanel}
          {canvasPanel}
          {selected ? inspectorPanel : elementPanel || <aside className="studio-inspector" aria-label="Content settings">{inspectorEmpty}</aside>}
        </> : (
          <PanelGroup orientation="horizontal" className="studio-panels" defaultLayout={panelLayout.defaultLayout} onLayoutChanged={panelLayout.onLayoutChanged}>
            <Panel id="studio-left" defaultSize="24%" minSize="18%" maxSize="45%" style={PANEL_STYLE}>{sidebarPanel}</Panel>
            <Separator className="studio-resize-handle" aria-label="Resize the settings panel" />
            <Panel id="studio-canvas" minSize="30%" style={PANEL_STYLE}>{canvasPanel}</Panel>
            <Separator className="studio-resize-handle" aria-label="Resize the inspector" />
            <Panel id="studio-inspector" defaultSize="22%" minSize="16%" maxSize="45%" style={PANEL_STYLE}>
              {selected ? inspectorPanel : elementPanel || inspectorEmpty}
            </Panel>
          </PanelGroup>
        )}
      </div>
      </FocusContext.Provider>
      </MediaPickerContext.Provider>
      </CopyTargetContext.Provider>
      <MediaPickerDialog lib={mediaLib} />

      <Dialog open={!!moveDialog} onClose={() => setMoveDialog(null)}
        title={moveDialog?.kind === "block" ? "Move block to another section" : `Move ${moveDialog?.kind === "sections" && moveDialog.ids.length > 1 ? `${moveDialog.ids.length} sections` : "section"} to another page`}
        description={moveDialog?.kind === "block" ? "Blocks can move to another section of the same kind, on any page." : "The section leaves this page and goes to the end of the page you pick. Undo brings it back."}
        footer={<><SecondaryButton onClick={() => setMoveDialog(null)}>Cancel</SecondaryButton><PrimaryButton disabled={!moveDest} onClick={confirmMove}>Move</PrimaryButton></>}>
        {moveDialog && (() => {
          const options = moveDialog.kind === "block" ? blockDestinations(moveDialog.sectionId)
            : [...SECTION_GROUP_KEYS.map(k => ({ value: k as string, label: surfaceLabel(k) })), ...templates.map(t => ({ value: t.id, label: t.label }))]
              .filter(o => o.value !== (showGlobal ? globalGroup : template.id));
          return options.length ? <div className="rp-field">
            <label className="rp-label" htmlFor="studio-move-dest">{moveDialog.kind === "block" ? "Section" : "Page"}</label>
            <select id="studio-move-dest" className="rp-input" value={moveDest} onChange={e => setMoveDest(e.target.value)}>
              <option value="">Choose…</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div> : <p className="studio-hint">There's no other section of this kind yet. Add one first, then move the block into it.</p>;
        })()}
      </Dialog>
      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts" description="Plain-key shortcuts work when you aren't typing in a field.">
        <div className="studio-shortcuts">
          {[...new Set(SHORTCUTS.map(x => x.group))].map(group => <section key={group}>
            <h3>{group}</h3>
            <dl>{SHORTCUTS.filter(x => x.group === group).map(x => <div key={x.action}><dt><kbd>{x.keys}</kbd></dt><dd>{x.label}</dd></div>)}</dl>
          </section>)}
        </div>
      </Dialog>
      <StudioSearch open={findOpen} onClose={() => setFindOpen(false)} index={searchIndex} context={paletteContext} onPick={goToResult} />
      <StudioHistory open={historyOpen} onClose={() => { setHistoryOpen(false); setHistoryPreview(null); }}
        versions={versions} reload={loadVersions} draft={design} published={published} normalize={normalizeForDiff} ctx={diffContext}
        previewingId={historyPreview?.id || null} onPreview={setHistoryPreview}
        onRestoreAll={(v) => {
          change(() => normalizeDesign(v.design, defaults), { label: `Restore “${versionName(v)}”` });
          setHistoryPreview(null); setHistoryOpen(false);
          say("ok", `“${versionName(v)}” restored to the draft. Save or Publish when ready.`, undoAction());
        }}
        onRestoreItem={(v, item: DiffItem) => {
          change(d => restoreItem(d, normalizeDesign(v.design, defaults), item), { label: `Restore ${item.label}` });
          say("ok", `${item.label} restored from “${versionName(v)}”.`, undoAction());
        }}
        actions={{ saveCheckpoint: (name, d) => adminApi.saveThemeCheckpoint(name, d) as Promise<ThemeVersion>, update: adminApi.updateThemeVersion, remove: adminApi.deleteThemeVersion }}
        askText={askText} askConfirm={askConfirm} say={(kind, text) => say(kind, text)} />
      <Dialog open={confirmAction !== null} onClose={() => setConfirmAction(null)} title={confirmAction === "publish" ? "Publish this design?" : "Discard this draft?"}>
        <div className="space-y-4">
          {confirmAction !== null && (() => {
            const summary = publishSummary(confirmAction === "publish" ? published : design, confirmAction === "publish" ? design : published);
            if (!summary.count) return <p className="text-sm font-bold" data-publish-empty>{confirmAction === "publish" ? "Nothing differs from the live shop — publishing changes nothing." : "Nothing differs from the live shop — discarding changes nothing."}</p>;
            return <>
              <p className="text-sm font-bold" data-publish-count>{summary.count} change{summary.count === 1 ? "" : "s"}</p>
              <p className="text-sm">{confirmAction === "publish" ? "These changes will become visible to shoppers immediately:" : "These draft changes will be permanently replaced by the current live design:"}</p>
              <ul className="list-disc pl-5 text-sm space-y-1">{summary.lines.map(x => <li key={x}>{x}</li>)}</ul>
            </>;
          })()}
          {liveCheckFailed && <p className="text-sm font-bold studio-dialog-warn" role="status" data-publish-live-check-failed>Couldn't check the live shop just now. The list above compares with the last version Studio saw, so it may miss changes made elsewhere.</p>}
          {confirmAction === "publish" && !publishHealth && <p className="studio-health-publish" data-publish-health-pending>
            <ShieldCheck size={14} aria-hidden /> {publishHealthState === "failed" ? "Studio Health couldn't check this page just now. Open Theme actions › Studio Health to try again." : "Checking the page…"}</p>}
          {confirmAction === "publish" && publishHealth && <p className="studio-health-publish" data-publish-health>
            <ShieldCheck size={14} aria-hidden /> {site.report && site.complete && site.ranAt?.device === device && !site.running
              ? <>Studio Health checked {template.label} on {REGION_DEVICE_LABELS[device].toLowerCase()}: {publishHealth.text}. Check every page at {new Date(site.ranAt.at).toLocaleTimeString()} ({site.report.totals.checked} pages, before any later edits): {site.report.totals.issues ? `${site.report.totals.issues} to fix` : "nothing to fix"}{site.report.totals.failed ? `, ${site.report.totals.failed} not checked` : ""}.</>
              : <>Studio Health checked {template.label} on {REGION_DEVICE_LABELS[device].toLowerCase()} only (other pages and sizes were not checked): {publishHealth.text}</>}
            {(publishHealth.issues > 0 || publishHealth.tips > 0 || (site.report?.totals.issues ?? 0) > 0) && <button type="button" className="studio-link-button" onClick={() => { setConfirmAction(null); openHealth(); }}>Review</button>}
          </p>}
          <div className="flex justify-end gap-2"><button className={btn} onClick={() => setConfirmAction(null)}>Cancel</button>{confirmAction === "publish" && <button className={btn} onClick={() => { setConfirmAction(null); setSchedule({ themeId: null }); }}>Schedule instead…</button>}<button className={confirmAction === "publish" ? btnPrimary : `${btn} border-red-300 text-red-700`} disabled={busy !== null || Boolean(inlineEditing)} title={busy !== null ? "Still saving — wait a moment" : inlineEditing ? "Finish the preview text edit first" : undefined} onClick={() => { const action = confirmAction; setConfirmAction(null); action === "publish" ? publish() : discard(); }}>{confirmAction === "publish" ? "Publish now" : "Discard draft"}</button></div>
        </div>
      </Dialog>
      <Dialog open={!!conflict} onClose={() => resolveConflict("cancel")} title="Saved in another tab or device"
        description="Since you opened Studio, this design was also saved somewhere else, and both versions changed the same settings.">
        {conflict && <div className="space-y-4">
          <p className="text-sm">Changed in both places:</p>
          <ul className="list-disc pl-5 text-sm space-y-1">{conflict.paths.slice(0, 8).map(path => <li key={path}>{conflictLabel(path, templates)}</li>)}
            {conflict.paths.length > 8 && <li>…and {conflict.paths.length - 8} more</li>}</ul>
          <p className="text-sm">Everything else from both versions is kept either way.{conflict.kind === "publish" ? " Nothing is published until you review the combined design and press Publish again." : ""}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className={btn} onClick={() => resolveConflict("cancel")}>Cancel</button>
            <button className={btn} onClick={() => resolveConflict("theirs")}>Use the other version</button>
            <button className={btnPrimary} onClick={() => resolveConflict("mine")}>{conflict.kind === "publish" ? "Keep mine, then review" : "Keep mine and save"}</button>
          </div>
        </div>}
      </Dialog>
      <StudioHealth open={checksOpen} onClose={() => setChecksOpen(false)} run={runHealth}
        pageLabel={showGlobal ? `Every page · ${groupLabel(globalGroup)}` : template.label} deviceLabel={REGION_DEVICE_LABELS[device].toLowerCase()}
        designResults={checksOpen ? [...designChecks(design), designSize(design)] : []} onShow={showFinding} onFix={fixFinding} site={sitePanel} />
      <StudioSchedule open={!!schedule} onClose={() => setSchedule(null)} draft={design} savedThemes={savedThemes} initialThemeId={schedule?.themeId}
        api={{ list: () => adminApi.listThemeSchedule() as any, add: async entry => {
          // The live values of the fields edited outside Publish, so the scheduler can keep later live edits (functions/themeSchedule.js).
          const live = await readPublished().catch(() => published);
          return adminApi.addThemeSchedule({ ...entry, liveBase: { ...(live?.categories !== undefined ? { categories: live.categories } : {}), ...(live?.showUnderConstruction !== undefined ? { showUnderConstruction: live.showUnderConstruction } : {}) } });
        }, cancel: id => adminApi.cancelThemeSchedule(id),
          endNow: id => adminApi.endCampaignNow(id), status: () => adminApi.getSchedulerStatus() }}
        askConfirm={askConfirm} say={(kind, text) => say(kind, text)} />
      {/* Last, so a question asked from inside another dialog (History, Media…) opens on top of it. */}
      {confirmNode}
      {promptNode}
    </div>
    </StudioAiContext.Provider>
    </DynamicSourcesContext.Provider>
    </StudioPickerProvider>
  );
}
