/**
 * Curated Google Fonts for the Studio font pickers (Style › Typography).
 * The Riso Press trio comes first. `weights` lists only weights Google actually
 * serves for that family — requesting a missing one makes the whole stylesheet 400.
 */
export interface FontChoice { name: string; weights: number[]; note?: string }

export const FONT_CHOICES: FontChoice[] = [
  { name: "Anton", weights: [400], note: "Riso display" },
  { name: "Archivo", weights: [400, 500, 600, 700, 800], note: "Riso body" },
  { name: "DM Mono", weights: [400, 500], note: "Riso labels" },
  { name: "Archivo Black", weights: [400] },
  { name: "Archivo Narrow", weights: [400, 500, 600, 700] },
  { name: "Bebas Neue", weights: [400] },
  { name: "Oswald", weights: [400, 500, 600, 700] },
  { name: "Space Grotesk", weights: [400, 500, 600, 700] },
  { name: "Space Mono", weights: [400, 700] },
  { name: "IBM Plex Mono", weights: [400, 500, 600] },
  { name: "Inter", weights: [400, 500, 600, 700, 800] },
  { name: "Work Sans", weights: [400, 500, 600, 700, 800] },
  { name: "Syne", weights: [400, 500, 600, 700, 800] },
  { name: "Cormorant Garamond", weights: [400, 500, 600, 700] },
  { name: "Playfair Display", weights: [400, 500, 600, 700, 800] },
  { name: "Libre Baskerville", weights: [400, 700] },
];

export const FONT_SELECT_OPTIONS = FONT_CHOICES.map(f => ({ value: f.name, label: f.note ? `${f.name} — ${f.note}` : f.name }));

/** Google Fonts CSS URL for a family; unknown (typed-in) families get the safe common set. */
export function googleFontHref(name: string): string {
  const known = FONT_CHOICES.find(f => f.name === name);
  const weights = known ? known.weights : [400, 700];
  const fam = name.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${fam}:wght@${weights.join(";")}&display=swap`;
}
