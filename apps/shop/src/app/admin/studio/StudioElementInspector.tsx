import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Lock, X } from "lucide-react";
import { IconButton, useFocusTrap } from "../riso/components";
import { StudioCopyField } from "./StudioCopyField";
import { ELEMENT_TABS, visibleTabs, type ElementRef, type ElementTabId, type ElementTabs, type PickedField } from "./elementCatalog";
import { TARGET_LABELS } from "./targetLabels";
import { STYLE_GROUPS } from "./styleSchema";
import { EXTRA_STYLE_CATEGORIES } from "./settingsMap";

type Props = {
  element: ElementRef;
  /** Where the part sits ("Header", "Footer"…), shown as a breadcrumb. */
  path: string[];
  tabs: ElementTabs;
  design: any;
  /** Published shop settings (Text & labels defaults that come from the shop's own text). */
  settings?: any;
  deviceLabel: string;
  scope: "all" | "page";
  pageLabel: string;
  onScope: (scope: "all" | "page") => void;
  renderField: (picked: PickedField) => ReactNode;
  onCopy: (key: string, value: string | undefined) => void;
  onOpenTheme: () => void;
  onOpenText: (group: string) => void;
  onOpenTarget: (target: string) => void;
  onClose: () => void;
  /** Returns to the Page layout outline (the list of parts and sections), closing this part. */
  onBack?: () => void;
};

/**
 * One inspector for a built-in part of the page: its Words, Style, Layout and Visibility in tabs,
 * using the same controls as Theme settings and Text & labels (so changes, resets and undo match).
 */
export function StudioElementInspector(p: Props) {
  const available = visibleTabs(p.tabs);
  const [tab, setTab] = useState<ElementTabId | null>(available[0] || null);
  const [search, setSearch] = useState("");
  useEffect(() => { setTab(visibleTabs(p.tabs)[0] || null); setSearch(""); }, [p.element.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = tab && available.includes(tab) ? tab : available[0] || null;
  const [overlay, setOverlay] = useState(() => !!window.matchMedia?.("(max-width: 767px)").matches);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 767px)");
    if (!media) return;
    const update = () => setOverlay(media.matches); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useFocusTrap(ref as any, overlay, p.onClose);

  const q = search.trim().toLowerCase();
  const words = useMemo(() => p.tabs.words.filter(f => !q || `${f.label} ${f.default} ${f.key}`.toLowerCase().includes(q)), [p.tabs.words, q]);
  const picked = current && current !== "words" ? p.tabs[current].filter(x => !q || `${x.field.label} ${x.field.key}`.toLowerCase().includes(q)) : [];
  const count = current === "words" ? p.tabs.words.length : current ? p.tabs[current].length : 0;
  const links = p.element.target.split("|").filter(t => /^(menus:|pages)/.test(t));
  const styled = available.some(id => id !== "words");

  return <aside ref={ref as any} className="studio-inspector studio-element-inspector" role={overlay ? "dialog" : undefined} aria-modal={overlay || undefined}
    aria-label={`${p.element.label} settings`} tabIndex={-1} data-studio-element-inspector>
    {p.onBack && <button type="button" className="studio-structure-switch" onClick={p.onBack}><ArrowLeft size={14} aria-hidden="true" /> Back to Page layout</button>}
    <header className="studio-inspector-head">
      <div><small>{p.path.length ? p.path.join(" › ") : "PAGE PART"}</small><h2>{p.element.label || "Page part"}</h2></div>
      <IconButton label="Close settings" onClick={p.onClose}><X size={17} /></IconButton>
    </header>
    {styled && <div className="studio-edit-context" role="status">
      <strong>{p.deviceLabel} preview</strong>
      <label className="studio-scope">Changes apply to
        <select aria-label="Changes apply to" value={p.scope} onChange={e => p.onScope(e.target.value as "all" | "page")}>
          <option value="all">All pages</option>
          <option value="page">This page only: {p.pageLabel}</option>
        </select>
      </label>
    </div>}
    {p.tabs.required && <p className="studio-element-note"><Lock size={12} aria-hidden="true" /> Shoppers need this part, so it can be restyled but not hidden.</p>}
    {available.length > 1 && <div className="studio-tabs" role="tablist" aria-label={`${p.element.label} settings`}>
      {ELEMENT_TABS.filter(t => available.includes(t.id)).map(t => <button key={t.id} role="tab" aria-selected={current === t.id}
        onClick={() => { setTab(t.id); setSearch(""); }}>{t.label}</button>)}
    </div>}
    <div className="studio-inspector-body">
      {!available.length && <p className="studio-hint">This part is edited elsewhere — use the links below.</p>}
      {count > 8 && <input className="studio-search" aria-label={`Search ${current} settings`} placeholder="Find a setting…" value={search} onChange={e => setSearch(e.target.value)} />}
      {current === "words" && <>
        <p className="studio-hint">{p.tabs.wordsNarrowed ? "The words shown in this part." : `All words for ${p.tabs.copyGroups.join(" and ")}.`} Changes apply to every page.</p>
        {words.map(f => <StudioCopyField key={f.key} field={f} design={p.design} settings={p.settings} onChange={value => p.onCopy(f.key, value)} />)}
      </>}
      {current && current !== "words" && <>
        {current === "layout" && <p className="studio-hint">Sizes and spacing for the {p.deviceLabel.toLowerCase()} preview. Blank values follow the larger size.</p>}
        {picked.map(x => p.renderField(x))}
      </>}
      {q && !words.length && !picked.length && <p className="studio-empty">No settings match “{search}”.</p>}
      <div className="studio-element-links">
        {/* A whole-page part spans several categories (colours, fonts, spacing): one button each, so "Space between sections" opens Layout & spacing. */}
        {p.tabs.styleGroups.length > 1 && !p.element.region
          ? p.tabs.styleGroups.map(g => <button key={g} type="button" className="studio-link-button" onClick={() => p.onOpenTarget(`style:${g}`)}>Open {styleGroupTitle(g)} in Theme settings</button>)
          : p.tabs.styleGroups.length > 0 && <button type="button" className="studio-link-button" onClick={p.onOpenTheme}>Open in Theme settings</button>}
        {p.tabs.copyGroups.map(g => <button key={g} type="button" className="studio-link-button" onClick={() => p.onOpenText(g)}>All words: {g}</button>)}
        {links.map(t => <button key={t} type="button" className="studio-link-button" onClick={() => p.onOpenTarget(t)}>{TARGET_LABELS[t] || t}</button>)}
      </div>
    </div>
  </aside>;
}

function styleGroupTitle(id: string): string {
  return EXTRA_STYLE_CATEGORIES[id]?.title || STYLE_GROUPS.find(g => g.id === id)?.title || id;
}
