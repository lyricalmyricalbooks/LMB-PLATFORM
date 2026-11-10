// What a press set up before its shop existed (code plan 18.9), handed to the new shop by the platform's setup step 20
// (setup/handover.js) in the admin-only `firstWeek/handover`. Get started applies it with the shop's own tools: the
// look step opens on the look the press chose (ChooseLookWelcome `chosen`), and the bring step offers the kept product
// file to the Books importer, which previews every row before anything saves (BringShopStage `kept`).

/** `firstWeek/handover` as the platform writes it. */
export interface SetupHandover {
  pressId?: string;
  /** The shop look (THEME_LIBRARY id) chosen in setup; "" when none. */
  look?: string;
  /** The product file kept in setup, its text in `parts` pieces under firstWeek/handover/parts; null when none. */
  file?: KeptFile | null;
  /** The whole website design made in the designer before the store existed (signup/pressRecord.js `design`); null when none. */
  design?: Record<string, any> | null;
  at?: string;
}

export interface KeptFile {
  name: string;
  rows: number;
  at: string;
  parts: number;
}

/** The look chosen in setup, for the look step; null when none was chosen. */
export function chosenLook(handover: SetupHandover | null | undefined): { theme: string } | null {
  const theme = typeof handover?.look === "string" ? handover.look.trim() : "";
  if (!theme) return null;
  return { theme };
}

/** The design made before the store existed, when there is one worth putting on (a plain object with something in it). */
export function chosenDesign(handover: SetupHandover | null | undefined): Record<string, any> | null {
  const design = handover?.design;
  if (!design || typeof design !== "object" || Array.isArray(design) || !Object.keys(design).length) return null;
  return design;
}

/** The look id the design was started from, for `welcome.theme` ("custom" when it names none). */
export function designWelcomeTheme(design: Record<string, any>): string {
  const id = typeof design?.themeBase?.id === "string" ? design.themeBase.id.trim() : "";
  return /^[a-z0-9-]{1,40}$/i.test(id) ? id : "custom";
}

/** The kept file, when the hand-over names one the admin can read back (at least one piece, a whole number of them). */
export function keptFile(handover: SetupHandover | null | undefined): KeptFile | null {
  const file = handover?.file;
  if (!file || typeof file !== "object" || !Number.isInteger(file.parts) || file.parts < 1 || file.parts > 20) return null;
  return {
    name: typeof file.name === "string" && file.name.trim() ? file.name.trim() : "products.csv",
    rows: Number.isInteger(file.rows) && file.rows > 0 ? file.rows : 0,
    at: typeof file.at === "string" ? file.at : "",
    parts: file.parts,
  };
}

/** The pieces back into one text. A missing piece would cut rows out of the file silently, so it throws instead. */
export function joinParts(parts: unknown[]): string {
  if (!parts.length || parts.some(p => typeof p !== "string")) throw new Error("Your file from setup couldn't be read in full.");
  return (parts as string[]).join("");
}

/** "my zines.csv, 12 books, kept on November 3": the line under "Your file from setup". `w` swaps book words for the shop's. */
export function keptFileLine(file: KeptFile, w: (words: string) => string = s => s, locale = "en-CA"): string {
  const count = file.rows === 0 ? "" : w(file.rows === 1 ? ", 1 book" : `, ${file.rows} books`);
  const day = file.at && !Number.isNaN(Date.parse(file.at))
    ? `, kept on ${new Date(file.at).toLocaleDateString(locale, { day: "numeric", month: "long", timeZone: "UTC" })}` : "";
  return `${file.name}${count}${day}`;
}
