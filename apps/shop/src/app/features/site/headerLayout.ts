/**
 * The shop header's named layouts (plan 1.22). The header used to switch between its two looks only through the
 * shop page's own layout (Shop page masthead & covers › Layout: Reference or Modern), so a press couldn't pick a header
 * without also changing the book grid. Now the header has its own setting, Header & announcement bar › Header layout:
 *
 *   - "classic": the big masthead (wordmark, bag total) over a ruled category bar. Called "Reference" before.
 *   - "modern":  logo, links and icons in one bar, with the bag button.
 *
 * Left empty (every existing shop), the header follows the shop page layout exactly as it did before: Modern draws
 * the modern header, anything else the classic one. Choosing a layout here never changes the shop page grid.
 */

export const HEADER_LAYOUTS = ["classic", "modern"] as const;
export type HeaderLayout = (typeof HEADER_LAYOUTS)[number];

/** The Studio choices for Header layout; the empty value keeps following the shop page layout. */
export const HEADER_LAYOUT_OPTIONS: { value: "" | HeaderLayout; label: string }[] = [
  { value: "", label: "Same as the shop page layout (default)" },
  { value: "classic", label: "Classic: big masthead over a ruled category bar" },
  { value: "modern", label: "Modern: logo, links and bag in one bar" },
];

/** The header layout a design draws. */
export function headerLayout(design: any): HeaderLayout {
  const chosen = design?.headerLayout;
  if (chosen === "classic" || chosen === "modern") return chosen;
  return design?.catalogLayoutStyle === "modern" ? "modern" : "classic";
}
