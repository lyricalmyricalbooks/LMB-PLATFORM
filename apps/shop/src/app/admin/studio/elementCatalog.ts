// What the inspector shows for a built-in part of the page (a header, the buy card, the bag…):
// its Words, Style, Layout and Visibility, gathered from the schemas that already exist
// (COPY_SCHEMA, STYLE_GROUPS, the region manifest and STYLE_TARGET_FIELDS). Nothing here adds
// or removes a control — it only decides which existing controls belong to the selected part.
import { COPY_SCHEMA, getCopyTemplate, type CopyField } from "../../features/site/storeCopy";
import { REGION_GROUPS, regionFieldDevice, regionKey, type RegionDevice } from "../../features/site/storefrontRegions";
import { STYLE_GROUPS, STYLE_TARGET_FIELDS, regionStyleFields, type StyleField, type StyleGroup } from "./styleSchema";
import { EXTRA_STYLE_CATEGORIES } from "./settingsMap";

/** A part of the page, as the preview reported it (structure row or click). */
export type ElementRef = { key: string; label: string; target: string; region?: string; text?: string };
export type PickedField = { group: StyleGroup; field: StyleField };
export type ElementTabs = {
  words: CopyField[];
  /** True when the words were narrowed to the ones visible inside the part. */
  wordsNarrowed: boolean;
  /** Text & labels groups the part's words come from (for "Edit all words for this area"). */
  copyGroups: string[];
  style: PickedField[];
  layout: PickedField[];
  visibility: PickedField[];
  /** Style categories the part belongs to, for "Open in Theme settings". */
  styleGroups: string[];
  required: boolean;
};

const LAYOUT_SUFFIXES = new Set(["Padding", "PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft",
  "MarginTop", "MarginRight", "MarginBottom", "MarginLeft", "Gap", "Width", "ElementWidth", "Height", "Align", "Columns"]);
const LAYOUT_KEY = /(Padding|Margin|Gap|Spacing|Width|Height|Columns|Align|Placement|Layout|Position)/;
const VISIBILITY_KEY = /^(show|hide)[A-Z]/;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The longest fixed piece of a copy template ("{count} books" → "books"), for matching rendered text. */
function fixedPiece(template: string): string {
  return template.split(/\{\w+\}/).map(norm).sort((a, b) => b.length - a.length)[0] || "";
}

/** Copy fields whose current text shows inside `text`. */
export function wordsShown(fields: CopyField[], design: any, text: string): CopyField[] {
  const haystack = norm(text || "");
  if (!haystack) return [];
  return fields.filter(f => {
    const piece = fixedPiece(getCopyTemplate(design, f.key));
    return piece.length >= 3 && haystack.includes(piece);
  });
}

function classify(field: StyleField): "style" | "layout" | "visibility" {
  if (VISIBILITY_KEY.test(field.key)) return "visibility";
  return LAYOUT_KEY.test(field.key) ? "layout" : "style";
}

export function elementTabs(el: ElementRef, device: RegionDevice, design: any): ElementTabs {
  const targets = el.target.split("|").filter(Boolean);
  const regionGroup = el.region ? REGION_GROUPS.find(g => g.regions.some(r => r.id === el.region)) : undefined;
  const region = regionGroup?.regions.find(r => r.id === el.region);

  const copyGroups = [...new Set([
    ...(region ? [region.copy || regionGroup!.copy] : []),
    ...targets.filter(t => t.startsWith("copy:")).map(t => t.slice(5)),
  ])].filter(g => COPY_SCHEMA.some(c => c.group === g));
  const allWords = COPY_SCHEMA.filter(g => copyGroups.includes(g.group)).flatMap(g => g.fields);
  const shown = wordsShown(allWords, design, el.text || "");

  const out: ElementTabs = {
    words: shown.length ? shown : allWords, wordsNarrowed: shown.length > 0, copyGroups,
    style: [], layout: [], visibility: [], styleGroups: [], required: Boolean(region?.required),
  };
  const seen = new Set<string>();
  const add = (bucket: "style" | "layout" | "visibility", group: StyleGroup, field: StyleField) => {
    if (seen.has(field.key)) return;
    seen.add(field.key); out[bucket].push({ group, field });
  };

  if (region && regionGroup) {
    const group = STYLE_GROUPS.find(g => g.id === regionGroup.id);
    if (group) {
      out.styleGroups.push(group.id);
      for (const field of regionStyleFields(group, region.id, device)) {
        const suffix = field.key.slice(("regions." + regionKey(region.id, "", regionFieldDevice(field.key))).length);
        add(suffix === "Visible" ? "visibility" : LAYOUT_SUFFIXES.has(suffix) ? "layout" : "style", group, field);
      }
    }
  }
  // A named part ("Buy card", "Announcement bar") gathers its own fields across groups.
  const pattern = !region ? STYLE_TARGET_FIELDS[el.label] : undefined;
  if (pattern) for (const group of STYLE_GROUPS) for (const field of group.fields) {
    if (!pattern.test(field.key)) continue;
    if (!out.styleGroups.includes(group.id)) out.styleGroups.push(group.id);
    add(classify(field), group, field);
  }
  // Otherwise every style category the part is linked to.
  if (!region && !pattern) for (const t of targets.filter(x => x.startsWith("style:"))) {
    const id = t.slice(6);
    if (EXTRA_STYLE_CATEGORIES[id]) { if (!out.styleGroups.includes(id)) out.styleGroups.push(id); continue; }
    const group = STYLE_GROUPS.find(g => g.id === id);
    if (!group) continue;
    if (!out.styleGroups.includes(id)) out.styleGroups.push(id);
    for (const field of group.fields) add(classify(field), group, field);
  }
  return out;
}

export const ELEMENT_TABS = [
  { id: "words", label: "Words" },
  { id: "style", label: "Style" },
  { id: "layout", label: "Layout" },
  { id: "visibility", label: "Visibility" },
] as const;
export type ElementTabId = typeof ELEMENT_TABS[number]["id"];

/** Tabs with something in them, in display order. */
export function visibleTabs(tabs: ElementTabs): ElementTabId[] {
  return ELEMENT_TABS.map(t => t.id).filter(id => tabs[id].length > 0);
}

/** Style categories that belong to the whole site rather than one part of a page (Theme settings only). */
export const GLOBAL_STYLE_GROUPS = ["tokens", "schemes", "buttons", "smallPrint", "effects", "riso", "code", "toasts"];
