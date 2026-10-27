import type { ReactNode } from "react";
import { Eye, EyeOff, Lock, PanelTop, PanelBottom, Layers, MessageSquare } from "lucide-react";
import { IconButton } from "../riso/components";
import { STUDIO_OVERLAYS, type PageStructure, type StructureItem } from "./pageStructure";
import type { StudioOverlay } from "../../features/site/studioOverlay";
import { groupLabel, type SectionGroupKey } from "../../features/site/sectionGroups";

/** Hide/show state of a built-in region at the size being previewed (null = not a region). */
export type RegionToggle = { visible: boolean; required: boolean } | null;

type Props = {
  structure: PageStructure | null;
  hoverKey: string | null;
  /** The part open in the inspector. */
  selectedKey?: string | null;
  deviceLabel: string;
  pageLabel: string;
  showGlobal: boolean;
  /** The shared section group being edited while `showGlobal`. */
  group: SectionGroupKey;
  /** How many sections each shared group has. */
  groupCounts: Record<string, number>;
  onHover: (key: string | null) => void;
  onOpen: (item: StructureItem) => void;
  onOverlay: (overlay: StudioOverlay | "close") => void;
  onOpenTarget: (target: string, label: string) => void;
  regionState: (region: string) => RegionToggle;
  onToggleRegion: (region: string, visible: boolean) => void;
  onGlobal: (group: SectionGroupKey) => void;
  onPage: () => void;
  /** The page's sections (the sortable outline). */
  children: ReactNode;
};

/**
 * The Page panel: everything on the page in one tree — Header, the page's own content
 * (built-in parts plus sections), Footer and pop-overs. Rows and the preview highlight each
 * other on hover; choosing a row opens its settings.
 */
export function StudioStructure(p: Props) {
  const s = p.structure;
  // "Style" / "Words": jump straight to the Theme settings category or Text & labels group behind a part.
  const actions = (label: string, target: string, inline = false): ReactNode => {
    const parts = target.split("|");
    const style = parts.find(t => t.startsWith("style:"));
    const words = parts.find(t => t.startsWith("copy:"));
    if (!style && !words) return null;
    return <span className="studio-structure-actions" data-inline={inline || undefined}>
      {style && <button type="button" aria-label={`Style settings for ${label}`} onClick={() => p.onOpenTarget(style, label)}>Style</button>}
      {words && <button type="button" aria-label={`Words for ${label}`} onClick={() => p.onOpenTarget(words, label)}>Words</button>}
    </span>;
  };
  const row = (item: StructureItem, depth = 0): ReactNode => {
    const toggle = item.region ? p.regionState(item.region) : null;
    const off = toggle?.visible === false;
    return <div key={item.key}>
      <div className="studio-tree-row studio-structure-row" data-hovered={p.hoverKey === item.key} data-selected={p.selectedKey === item.key} data-hidden={off}
        data-has-actions={/(^|\|)(style|copy):/.test(item.target) || undefined}
        style={depth ? { paddingLeft: depth * 14 } : undefined}
        onMouseEnter={() => p.onHover(item.key)} onMouseLeave={() => p.onHover(null)}>
        <button className="studio-tree-label" aria-current={p.selectedKey === item.key || undefined} onClick={() => p.onOpen(item)} onFocus={() => p.onHover(item.key)} onBlur={() => p.onHover(null)}>
          {item.label}
          <small>{[
            item.count > 1 ? `${item.count} on this page` : "",
            off ? `Hidden on ${p.deviceLabel.toLowerCase()}` : item.hidden ? `Not showing on ${p.deviceLabel.toLowerCase()} right now` : "",
          ].filter(Boolean).join(" · ") || "Built in"}</small>
        </button>
        {actions(item.label, item.target)}
        {toggle && (toggle.required
          ? <span className="studio-structure-lock" title="Shoppers need this to buy or stay informed, so it can be restyled but not hidden."><Lock size={13} aria-label="Always shown" /></span>
          : <IconButton label={off ? `Show ${item.label} on ${p.deviceLabel.toLowerCase()}` : `Hide ${item.label} on ${p.deviceLabel.toLowerCase()}`}
              onClick={() => p.onToggleRegion(item.region, !off)}>{off ? <EyeOff size={13} /> : <Eye size={13} />}</IconButton>)}
      </div>
      {item.children.map(child => row(child, depth + 1))}
    </div>;
  };
  const list = (items: StructureItem[] | undefined, empty: string) => !s
    ? <p className="studio-hint">Reading the page in the preview…</p>
    : items?.length ? items.map(i => row(i)) : <p className="studio-hint">{empty}</p>;

  // Shared section groups (every page): each one is offered where it appears on the page.
  const groupButton = (key: SectionGroupKey, text: string) => !(p.showGlobal && p.group === key) &&
    <button className="studio-structure-switch" onClick={() => p.onGlobal(key)}>{text} ({p.groupCounts[key] || 0}) — shown on every page</button>;

  return <div className="studio-structure">
    <details className="studio-structure-group">
      <summary><PanelTop size={14} /> Header{s ? <small>{count(s.header)}</small> : null}</summary>
      {list(s?.header, "This page has no header.")}
      {groupButton("headerSections", "Shared sections under the header")}
    </details>

    <details className="studio-structure-group" open>
      <summary><Layers size={14} /> {p.showGlobal ? `Every page · ${groupLabel(p.group)}` : `Page · ${p.pageLabel}`}</summary>
      {p.showGlobal
        ? <button className="studio-structure-switch" onClick={p.onPage}>← Back to {p.pageLabel}</button>
        : <>
          {s?.page.map(i => row(i))}
          {s && s.main.length > 0 && <div className="studio-structure-builtin">
            <p className="studio-structure-sub">Built into this page</p>
            {s.main.map(i => row(i))}
          </div>}
          <p className="studio-structure-sub">Sections</p>
        </>}
      {p.children}
    </details>

    <details className="studio-structure-group">
      <summary><PanelBottom size={14} /> Footer{s ? <small>{count(s.footer)}</small> : null}</summary>
      {groupButton("globalSections", "Shared sections above the footer")}
      {list(s?.footer, "This page has no footer.")}
    </details>

    <details className="studio-structure-group">
      <summary><MessageSquare size={14} /> Pop-ups</summary>
      <p className="studio-hint">Open one in the preview to see and style it.</p>
      {groupButton("overlaySections", "Pop-up sections")}
      {STUDIO_OVERLAYS.map(o => <div key={o.id} className="studio-tree-row studio-structure-row">
        <button className="studio-tree-label" onClick={() => p.onOpenTarget(o.target.split("|")[0], o.label)}>{o.label}<small>Settings</small></button>
        {actions(o.label, o.target, true)}
        <button className="studio-structure-open" onClick={() => p.onOverlay(o.id)}>Open in preview</button>
      </div>)}
      {s && s.overlay.length > 0 && <><p className="studio-structure-sub">Open in the preview now</p>{s.overlay.map(i => row(i))}</>}
      <button className="studio-structure-switch" onClick={() => p.onOverlay("close")}>Close pop-ups</button>
    </details>
  </div>;
}

function count(items: StructureItem[]): string {
  const total = (list: StructureItem[]): number => list.reduce((n, i) => n + 1 + total(i.children), 0);
  const n = total(items);
  return n ? `${n}` : "";
}
