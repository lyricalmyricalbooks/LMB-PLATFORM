import { SECTION_GROUP_KEYS } from "../../features/site/sectionGroups";
import { hasTokens, isDynamic } from "../../features/site/dynamicSources";
type Field = { key: string; kind: string };

/** Fields whose filled-in value counts as content. Picker kinds hold the same strings text fields did. */
const CONTENT_KINDS = ["text", "textarea", "richtext", "html", "image", "link", "book", "books", "category", "page", "video"];

/** Data-only theme checks kept independent of editor components for reliable tests. */
export function designChecks(
  design: any,
  schema: {
    sectionFields: (type: string) => Field[];
    blockFields: (type: string) => Field[];
    blocksKey: (type: string) => string;
  },
): { tone: "ok" | "warn"; text: string }[] {
  const sections = [
    ...SECTION_GROUP_KEYS.flatMap(key => Array.isArray(design?.[key]) ? design[key] : []),
    ...Object.values(design || {}).flatMap((value: any) => Array.isArray(value?.sections) ? value.sections : []),
  ];
  const images: { url: string; alt: string }[] = [];
  const collectImages = (content: any, fields: Field[]) => {
    for (const field of fields.filter(field => field.kind === "image")) {
      const url = content?.[field.key];
      if (!url || typeof url !== "string") continue;
      const altKey = [`${field.key}Alt`, `${field.key}AltText`, "alt", "imageAlt", "imageAltText"].find(key => content[key] != null);
      const alt = altKey ? content[altKey] : "";
      // A description connected to a book/category/page detail (Studio 2.7) counts as described.
      images.push({ url, alt: typeof alt === "string" ? alt : isDynamic(alt) ? `‹${alt.$dyn}›` : "" });
    }
  };
  const collectBlocks = (sectionType: string, blocks: any[]) => (blocks || []).forEach(block => {
    collectImages(block, schema.blockFields(sectionType));
    collectBlocks(sectionType, block?.children || []);
  });
  sections.forEach((section: any) => {
    collectImages(section.settings, schema.sectionFields(section.type));
    const key = schema.blocksKey(section.type);
    const blocks = section.settings?.[key]?.length ? section.settings[key] : section.settings?.blocks || [];
    collectBlocks(section.type, blocks);
  });

  const results: { tone: "ok" | "warn"; text: string }[] = [];
  const empty = sections.filter((section: any) => {
    const fields = schema.sectionFields(section.type).filter(field => [...CONTENT_KINDS, "list"].includes(field.kind));
    const hasText = (text: string) => Boolean(text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim());
    const hasContent = fields.some(field => {
      const value = section.settings?.[field.key];
      return isDynamic(value) || hasTokens(value) ? true : typeof value === "string" ? hasText(value) : Array.isArray(value)
        ? value.some(item => typeof item === "string" ? hasText(item) : item && Object.values(item).some(v => typeof v === "string" && hasText(v)))
        : false;
    });
    const blockFields = schema.blockFields(section.type).filter(field => CONTENT_KINDS.includes(field.kind));
    const hasBlockContent = (blocks: any[]): boolean => (blocks || []).some(block =>
      blockFields.some(field => isDynamic(block[field.key]) || (typeof block[field.key] === "string" && hasText(block[field.key]))) || hasBlockContent(block.children || []));
    const key = schema.blocksKey(section.type);
    const blocks = section.settings?.[key]?.length ? section.settings[key] : section.settings?.blocks || [];
    return !hasContent && !hasBlockContent(blocks);
  }).length;
  results.push({ tone: empty ? "warn" : "ok", text: empty ? `${empty} section${empty === 1 ? " is" : "s are"} empty or may lack meaningful content.` : "No obviously empty sections." });
  const missingAlt = images.filter(image => !image.alt.trim()).length;
  results.push({ tone: missingAlt ? "warn" : "ok", text: missingAlt ? `${missingAlt} image${missingAlt === 1 ? " needs" : "s need"} a description.` : "All configured section and block images have descriptions." });
  // Contrast, picture weight and size, tap targets and links are measured on the rendered page (Studio Health, healthAudit.ts).
  results.push({ tone: "warn", text: "Contrast, picture sizes, tap targets and links are measured on the page in the preview. Check your other pages and the phone size too." });
  return results;
}

/** A design is stored in one Firestore document (1 MiB limit) that every shopper downloads. */
export const DESIGN_WARN_BYTES = 600_000;
export const DESIGN_MAX_BYTES = 900_000;
export function designSize(design: any): { bytes: number; tone: "ok" | "warn"; text: string; tooBig: boolean } {
  const bytes = new TextEncoder().encode(JSON.stringify(design ?? {})).length;
  const kb = Math.round(bytes / 1024);
  if (bytes > DESIGN_MAX_BYTES) return { bytes, tone: "warn", tooBig: true, text: `Design size: ${kb} KB — too large to save (limit about ${Math.round(DESIGN_MAX_BYTES / 1024)} KB). Remove unused sections or large pasted content.` };
  if (bytes > DESIGN_WARN_BYTES) return { bytes, tone: "warn", tooBig: false, text: `Design size: ${kb} KB. Shoppers download the whole design, so keep it lean — remove unused sections or pasted images.` };
  return { bytes, tone: "ok", tooBig: false, text: `Design size: ${kb} KB (shoppers download this on every visit; under ${Math.round(DESIGN_WARN_BYTES / 1024)} KB is comfortable).` };
}
