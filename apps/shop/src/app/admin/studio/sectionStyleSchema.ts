// Every per-section look and layout setting, as data. The section inspector renders these in its
// Style / Layout / Visibility tabs with the shared field editor, replacing the old hand-written
// "Layout & style" panel. The keys are the ones the storefront renderer already reads
// (components/sectionRender.tsx, sectionStyleHelpers.ts) — no data changes.
import { BACKDROP_BLUR_OPTIONS, BOX_SHADOW_OPTIONS, CORNER_RADIUS_OPTIONS, HOVER_EFFECTS, SECTION_ANIMATIONS, SECTION_FONT_OPTIONS, SHAPE_DIVIDER_STYLES } from "../../components/sectionStyleHelpers";
import { PADDING_KEYS } from "../../features/site/breakpoints";
import { SPACE_STEPS } from "../../features/site/designTokens";
import { BLOCK_HOVERS, BLOCK_REVEALS, PARALLAX } from "../../components/sectionMotion";

export type SectionTab = "style" | "layout" | "visibility";
type Option = { value: string; label: string };
export type SectionStyleField = { key: string; label: string; tab: SectionTab; group: string; hint?: string } & (
  | { kind: "text" | "textarea" | "html" | "color" | "image" | "toggle" | "date" }
  | { kind: "number" | "range"; min: number; max: number; step?: number; suffix?: string }
  | { kind: "select"; options: Option[] });

const inherit = (options: Option[]) => [{ value: "", label: "— Inherit —" }, ...options];
const weights = ["300 · Light", "400 · Regular", "500 · Medium", "600 · Semibold", "700 · Bold", "800 · Extrabold", "900 · Black"]
  .map(label => ({ value: label.slice(0, 3), label }));

/** The section look/layout fields; `colorSchemes` fills the colour-scheme choices. */
export function sectionStyleFields(colorSchemes: { id: string; name: string }[] = []): SectionStyleField[] {
  const style = (group: string, f: any): SectionStyleField => ({ tab: "style", group, ...f });
  const layout = (group: string, f: any): SectionStyleField => ({ tab: "layout", group, ...f });
  const visibility = (group: string, f: any): SectionStyleField => ({ tab: "visibility", group, ...f });
  return [
    style("Colours & fonts", { key: "colorSchemeId", label: "Colour scheme", kind: "select", options: inherit(colorSchemes.map(c => ({ value: c.id, label: c.name }))) }),
    style("Colours & fonts", { key: "headingFontOverride", label: "Heading font", kind: "select", options: inherit(SECTION_FONT_OPTIONS.map(f => ({ value: f, label: f }))) }),
    style("Colours & fonts", { key: "bodyFontOverride", label: "Body font", kind: "select", options: inherit(SECTION_FONT_OPTIONS.map(f => ({ value: f, label: f }))) }),

    style("Background", { key: "bgColor", label: "Solid colour", kind: "color" }),
    style("Background", { key: "bgGradientFrom", label: "Gradient from", kind: "color", hint: "Set both gradient colours for a fade (it replaces the solid colour). With only one set, it fills the section when no solid colour is chosen." }),
    style("Background", { key: "bgGradientTo", label: "Gradient to", kind: "color" }),
    style("Background", { key: "bgGradientDir", label: "Gradient direction", kind: "select", options: [
      { value: "", label: "— Default (to bottom) —" }, { value: "to bottom", label: "↓ Top to bottom" }, { value: "to top", label: "↑ Bottom to top" },
      { value: "to right", label: "→ Left to right" }, { value: "to left", label: "← Right to left" },
      { value: "to bottom right", label: "↘ Diagonal" }, { value: "to bottom left", label: "↙ Diagonal" }] }),
    style("Background", { key: "bgImageUrl", label: "Background image", kind: "image" }),
    style("Background", { key: "bgImageSize", label: "Image size", kind: "select", options: [
      { value: "", label: "Cover (default)" }, { value: "contain", label: "Contain" }, { value: "auto", label: "Auto" }, { value: "100% 100%", label: "Stretch" }] }),
    style("Background", { key: "bgImagePosition", label: "Image position", kind: "select", options: [
      { value: "", label: "Center (default)" }, ...["top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"]
        .map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))] }),

    style("Text", { key: "headingColor", label: "Heading colour", kind: "color" }),
    style("Text", { key: "bodyColor", label: "Body text colour", kind: "color" }),
    style("Text", { key: "headingGradientFrom", label: "Heading gradient from", kind: "color" }),
    style("Text", { key: "headingGradientTo", label: "Heading gradient to", kind: "color" }),
    style("Text", { key: "headingSize", label: "Heading size", kind: "range", min: 14, max: 120, suffix: "px" }),
    style("Text", { key: "headingWeight", label: "Heading weight", kind: "select", options: inherit(weights) }),
    style("Text", { key: "textTransform", label: "Letter case", kind: "select", options: inherit([
      { value: "none", label: "None (as typed)" }, { value: "uppercase", label: "UPPERCASE" }, { value: "lowercase", label: "lowercase" }, { value: "capitalize", label: "Capitalize" }]) }),
    style("Text", { key: "letterSpacingOverride", label: "Letter spacing", kind: "range", min: -0.05, max: 0.5, step: 0.01, suffix: "em" }),
    style("Text", { key: "lineHeightOverride", label: "Line height", kind: "range", min: 1, max: 2.5, step: 0.05 }),

    style("Boxes & lines", { key: "boxColor", label: "Box fill", kind: "color" }),
    style("Boxes & lines", { key: "raisedBoxColor", label: "Raised box fill", kind: "color" }),
    style("Boxes & lines", { key: "lineColor", label: "Line / border colour", kind: "color", hint: "Colours the lines and outlines this section draws (cards, dividers, form boxes). A section with no lines shows no change." }),

    style("Buttons", { key: "btnBg", label: "Button background", kind: "color" }),
    style("Buttons", { key: "btnText", label: "Button text", kind: "color" }),
    style("Buttons", { key: "btnStyle", label: "Button style", kind: "select", options: inherit([
      { value: "solid", label: "Solid (filled)" }, { value: "outline", label: "Outline" }, { value: "ghost", label: "Ghost" }]) }),
    style("Buttons", { key: "btnRadius", label: "Button corners", kind: "range", min: 0, max: 40, suffix: "px" }),
    style("Buttons", { key: "btnUppercase", label: "Uppercase button text", kind: "toggle" }),
    style("Buttons", { key: "btnMagnetic", label: "Magnetic effect", kind: "toggle", hint: "The button gently follows the pointer on desktop." }),

    style("Effects", { key: "boxShadow", label: "Shadow", kind: "select", options: BOX_SHADOW_OPTIONS }),
    style("Effects", { key: "cornerRadius", label: "Corner radius", kind: "select", options: CORNER_RADIUS_OPTIONS }),
    style("Effects", { key: "backdropBlur", label: "Backdrop blur", kind: "select", options: BACKDROP_BLUR_OPTIONS }),
    style("Effects", { key: "hoverEffect", label: "Hover effect", kind: "select", options: HOVER_EFFECTS }),
    // Motion as a finishing step (3.0 phase 4, components/sectionMotion.ts). Shoppers who ask for less motion get none.
    style("Motion", { key: "animation", label: "Section entrance", kind: "select", options: SECTION_ANIMATIONS }),
    style("Motion", { key: "revealBlocks", label: "Blocks appear as you scroll", kind: "select", options: BLOCK_REVEALS, hint: "Each block or card inside this section appears when it scrolls into view." }),
    style("Motion", { key: "staggerStep", label: "Delay between blocks", kind: "number", min: 0, max: 400, suffix: "ms", hint: "Blank = 90 ms. 0 = all at once." }),
    style("Motion", { key: "motionDuration", label: "How long it takes", kind: "number", min: 200, max: 2000, suffix: "ms", hint: "Blank = 0.7 s for blocks, 0.9 s for the entrance." }),
    style("Motion", { key: "motionDelay", label: "Wait before starting", kind: "number", min: 0, max: 1500, suffix: "ms" }),
    style("Motion", { key: "blockHover", label: "Blocks and cards when pointed at", kind: "select", options: BLOCK_HOVERS }),
    style("Motion", { key: "parallax", label: "Background picture drifts while scrolling (parallax)", kind: "select", options: PARALLAX, hint: "Works in browsers that support scroll-linked animation; others show the picture still." }),
    style("Motion", { key: "sticky", label: "Stay on screen while scrolling (sticky)", kind: "toggle" }),
    style("Motion", { key: "stickyTop", label: "Sticky distance from the top", kind: "number", min: 0, max: 300, suffix: "px" }),
    style("Motion", { key: "motionOffOnPhones", label: "Turn motion off on phones", kind: "toggle" }),
    style("Effects", { key: "shapeDividerTop", label: "Shape divider · top", kind: "select", options: SHAPE_DIVIDER_STYLES }),
    style("Effects", { key: "shapeDividerTopColor", label: "Top divider colour", kind: "color" }),
    style("Effects", { key: "shapeDividerBottom", label: "Shape divider · bottom", kind: "select", options: SHAPE_DIVIDER_STYLES }),
    style("Effects", { key: "shapeDividerBottomColor", label: "Bottom divider colour", kind: "color" }),

    style("Custom code (advanced)", { key: "customCss", label: "Scoped CSS", kind: "html", hint: "Use & to target this section. The CSS only applies to this section." }),
    style("Custom code (advanced)", { key: "customClass", label: "Custom CSS class", kind: "text" }),

    layout("Width", { key: "containerWidth", label: "Content width", kind: "select", options: inherit([
      { value: "xs", label: "XS · Narrow" }, { value: "sm", label: "SM · Small" }, { value: "md", label: "MD · Medium" },
      { value: "lg", label: "LG · Wide" }, { value: "xl", label: "XL · Extra wide" }, { value: "full", label: "Full · No limit" }]) }),
    layout("Spacing", { key: "spacingStep", label: "Space above and below (from Design scales)", kind: "select",
      options: [{ value: "", label: "— Use the padding numbers —" }, ...SPACE_STEPS.map(s => ({ value: s.value, label: `${s.label} (${s.units} units)` }))],
      hint: "Uses the spacing unit set in Theme settings › Design scales, so every section stays in step. Padding numbers typed in Spacing still win." }),
    layout("Width", { key: "fullWidth", label: "Full width (edge to edge)", kind: "toggle" }),
    layout("Phones", { key: "mobileFontScale", label: "Phone text scale", kind: "number", min: 60, max: 140, suffix: "%", hint: "Blank = 100%." }),
    layout("Phones", { key: "mobileHeadingSize", label: "Phone heading size", kind: "number", min: 12, max: 120, suffix: "px", hint: "Blank = automatic." }),
    layout("Phones", { key: "mobileColumns", label: "Phone grid columns", kind: "number", min: 1, max: 4, hint: "Blank = automatic." }),

    visibility("Screen sizes", { key: "hideOnMobile", label: "Hide on phones", kind: "toggle", hint: "Up to 767px wide." }),
    visibility("Screen sizes", { key: "hideOnTablet", label: "Hide on tablets", kind: "toggle", hint: "768–1023px wide." }),
    visibility("Screen sizes", { key: "hideOnDesktop", label: "Hide on tablets and desktops", kind: "toggle", hint: "768px and wider." }),
    visibility("Schedule", { key: "showFrom", label: "Show from", kind: "date", hint: "Optional publish window, e.g. a sale banner. Times are Toronto (shop) time for every visitor." }),
    visibility("Schedule", { key: "showUntil", label: "Show until", kind: "date" }),
    visibility("Connected details", { key: "hideWhenEmpty", label: "Hide when a connected detail is empty", kind: "toggle", hint: "For fields connected to the book, category or page: leave this section out where that detail isn't filled in (the Studio preview still shows it)." }),
  ];
}

/** Padding is edited per device by the Spacing card (the same keys, plus tablet/phone versions). */
export const SPACING_CARD_KEYS = [...PADDING_KEYS, ...PADDING_KEYS.map(k => "mobile" + k[0].toUpperCase() + k.slice(1)), ...PADDING_KEYS.map(k => "tablet" + k[0].toUpperCase() + k.slice(1))];

/** What a field writes for an editor value: blanks and "none" dividers clear the setting (as before). */
export function sectionStyleValue(field: SectionStyleField, value: any): any {
  if (value === "" || value === null) return undefined;
  if ((field.key === "shapeDividerTop" || field.key === "shapeDividerBottom") && value === "none") return undefined;
  if (field.kind === "toggle") return value ? true : undefined;
  return value;
}

export const SECTION_TABS: { id: "content" | SectionTab; label: string }[] = [
  { id: "content", label: "Content" }, { id: "style", label: "Style" }, { id: "layout", label: "Layout" }, { id: "visibility", label: "Visibility" },
];
