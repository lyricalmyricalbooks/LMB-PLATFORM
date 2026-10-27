import { COPY_SCHEMA } from "../../features/site/storeCopy";
import { STYLE_GROUPS } from "./styleSchema";
import { EXTRA_STYLE_CATEGORIES } from "./settingsMap";

/**
 * What each click-to-edit target is called in the preview's "what do you want to edit?" pop-up,
 * so a part with several targets lists distinct, descriptive choices ("Style: Header & announcement
 * bar", "Words: Header") instead of repeated generic ones.
 */
export function targetLabels(): Record<string, string> {
  const labels: Record<string, string> = {
    "menus:categories": "Shop categories",
    "menus:header-order": "Header bar order",
    "menus:header": "Header menu links",
    "menus:footer": "Footer menu links",
    pages: "Pages",
  };
  for (const g of STYLE_GROUPS) labels[`style:${g.id}`] = `Style: ${g.title}`;
  for (const [id, c] of Object.entries(EXTRA_STYLE_CATEGORIES)) labels[`style:${id}`] = `Style: ${c.title}`;
  for (const g of COPY_SCHEMA) labels[`copy:${g.group}`] = `Words: ${g.group}`;
  return labels;
}

export const TARGET_LABELS = targetLabels();
