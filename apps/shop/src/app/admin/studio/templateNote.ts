// The template-only controls in Theme settings › Print style & template details draw nothing while the shop uses
// Riso Press or Standard. Without a word next to them, a press changes one, sees no change and thinks the designer is
// broken, so each says so under the control until a template is picked.
import { TEMPLATE_KNOBS, TEMPLATE_STYLES, templateStyleId } from "../../features/site/templateStyles";

/** Controls only a template draws (the template's own keys, not the shared button and photo ones). */
export const TEMPLATE_ONLY_KEYS: ReadonlySet<string> = new Set(TEMPLATE_KNOBS.flatMap((k) => k.keys).filter((k) => k.startsWith("template")));

/** The note under `key`, or null when it already shows on the page. */
export function templateOnlyNote(key: string, design: Record<string, any> | null | undefined): string | null {
  if (!TEMPLATE_ONLY_KEYS.has(key) || templateStyleId(design)) return null;
  const now = design?.themeStyle === "riso" ? "Riso Press" : "Standard";
  const name = TEMPLATE_STYLES[0].label.split(" (")[0];
  return `Settings marked (templates) show only on a template, like ${name}. Print style is ${now}.`;
}

/** The template-only controls the press has set, for Reset template details (empty: nothing to reset). */
export function templateDetailsSet(design: Record<string, any> | null | undefined): string[] {
  return [...TEMPLATE_ONLY_KEYS].filter((key) => design?.[key] != null && design[key] !== "");
}
