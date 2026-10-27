import { goHint } from "./shortcuts";
import { FileText, Images, LayoutList, Navigation, Palette, SwatchBook, Type } from "lucide-react";

export type RailTab = "sections" | "style" | "text" | "menus" | "pages" | "media" | "themes";
export const RAIL_TABS: { id: RailTab; label: string; short: string; Icon: typeof Palette; hint: string }[] = [
  { id: "sections", label: "Page layout", short: "Layout", Icon: LayoutList, hint: "Add, arrange and edit this page's sections" },
  { id: "style", label: "Theme settings", short: "Theme", Icon: Palette, hint: "Colours, fonts, buttons and every element's look" },
  { id: "text", label: "Text & labels", short: "Text", Icon: Type, hint: "Every word shoppers see" },
  { id: "menus", label: "Navigation", short: "Menus", Icon: Navigation, hint: "Menus, shop categories and their order" },
  { id: "pages", label: "Pages", short: "Pages", Icon: FileText, hint: "About, Contact, policies and other pages" },
  { id: "media", label: "Media", short: "Media", Icon: Images, hint: "Your uploaded images: descriptions, sizes and where each is used" },
  { id: "themes", label: "Themes", short: "Themes", Icon: SwatchBook, hint: "Your saved themes, ready-made looks and private preview links" },
];

/** Studio's left icon rail: one button per workspace, always visible. */
export function StudioRail({ active, onSelect }: { active: RailTab; onSelect: (id: RailTab) => void }) {
  return (
    <nav className="studio-rail" aria-label="Studio workspaces">
      {RAIL_TABS.map(({ id, label, short, Icon, hint }) => (
        <button key={id} type="button" aria-pressed={active === id} aria-label={label} title={`${label} — ${hint} (${goHint(id)})`} onClick={() => onSelect(id)}>
          <Icon size={18} aria-hidden /><span aria-hidden>{short}</span>
        </button>
      ))}
    </nav>
  );
}
