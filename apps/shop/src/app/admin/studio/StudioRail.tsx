import { goHint } from "./shortcuts";
import { Fragment, useEffect, useRef } from "react";
import { FileText, Images, LayoutList, Navigation, Palette, Sparkles, Type } from "lucide-react";

export type RailTab = "essentials" | "sections" | "style" | "text" | "menus" | "pages" | "media";
type Workspace = { id: RailTab; label: string; short: string; Icon: typeof Palette; hint: string; section?: string; home?: RailTab };
/**
 * Every workspace, with the name the breadcrumb, Find and the panel heading use (starters and Studio rethink, step 6).
 * Three sit on the rail: Page, Style and Pages (Designs left on 26 November 2026: the website is chosen on Online store). Basics opens inside Style and Menus inside Pages (`home`), each
 * with a switch at the top of the panel; Text & labels and Media sit under "More".
 */
export const WORKSPACES: Workspace[] = [
  { id: "sections", label: "Page", short: "Page", Icon: LayoutList, hint: "This page's sections, top to bottom: add, arrange and edit them" },
  { id: "essentials", label: "Basics", short: "Basics", Icon: Sparkles, hint: "Name, logo, colours, fonts and the first steps", home: "style" },
  { id: "style", label: "Style", short: "Style", Icon: Palette, hint: "The whole shop's look: colours, fonts, buttons and every part" },
  { id: "pages", label: "Pages", short: "Pages", Icon: FileText, hint: "About, Contact, policies and the menus that reach them" },
  { id: "menus", label: "Menus", short: "Menus", Icon: Navigation, hint: "Menus, shop categories and their order", home: "pages" },
  { id: "text", label: "Text & labels", short: "Words", Icon: Type, hint: "Every word shoppers see, including emails and checkout", section: "More" },
  { id: "media", label: "Media", short: "Media", Icon: Images, hint: "Your uploaded images: descriptions, sizes and where each is used" },
];
/** The rail's buttons, in order. */
export const RAIL_TABS = WORKSPACES.filter(w => !w.home);
/** The rail button a workspace lights up (Basics → Style, Menus → Pages). */
export const railHome = (tab: RailTab): RailTab => WORKSPACES.find(w => w.id === tab)?.home || tab;
/** The workspaces that share one rail button, in the switch's order (Basics before Every setting). */
export const workspaceGroup = (tab: RailTab): Workspace[] => {
  const home = railHome(tab);
  return WORKSPACES.filter(w => w.id === home || w.home === home);
};
export const workspaceLabel = (tab: RailTab) => WORKSPACES.find(w => w.id === tab)?.label || tab;

/** The switch at the top of a panel whose rail button holds two workspaces (Style: Basics · Every setting). */
export function WorkspaceSwitch({ active, onSelect }: { active: RailTab; onSelect: (id: RailTab) => void }) {
  const group = workspaceGroup(active);
  if (group.length < 2) return null;
  const name = (w: Workspace) => w.id === "style" ? "Every setting" : w.label;
  return (
    <div className="studio-workspace-switch" role="group" aria-label={`${workspaceLabel(railHome(active))} views`} data-studio-workspace-switch>
      {group.map(w => (
        <button key={w.id} type="button" aria-pressed={w.id === active} onClick={() => onSelect(w.id)}>{name(w)}</button>
      ))}
    </div>
  );
}

/** Studio's left icon rail: one button per workspace, always visible. */
export function StudioRail({ active, onSelect }: { active: RailTab; onSelect: (id: RailTab) => void }) {
  // On a phone the workspaces are one sideways-scrolling row: keep the open one in sight. The
  // row is hidden until its tab is opened, so this runs again when it gets a width.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = nav.current;
    if (!row) return;
    const show = () => {
      const open = row.querySelector<HTMLElement>("button[aria-pressed=true]");
      if (!open || row.scrollWidth <= row.clientWidth) return;
      const left = open.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + open.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - (row.clientWidth - open.offsetWidth) / 2;
    };
    show();
    if (typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(show);
    seen.observe(row);
    return () => seen.disconnect();
  }, [active]);
  return (
    <nav ref={nav} className="studio-rail" aria-label="Studio workspaces">
      {RAIL_TABS.map(({ id, label, short, Icon, hint, section }) => (
        <Fragment key={id}>
          {section && <span className="studio-rail-section" role="presentation">{section}</span>}
          <button type="button" aria-pressed={railHome(active) === id} aria-label={label} title={`${label} — ${hint} (${goHint(id)})`} onClick={() => onSelect(id)}>
            <Icon size={18} aria-hidden /><span aria-hidden>{short}</span>
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
