// Get started, step 2: bring your shop with you (plan 17.3), and the help for each answer (plan 17.4).
// Pure: the question, the answers, the plain steps for getting a product file out of the old shop, and the marker the
// step records. The import itself is the Books importer (plans 3.1, 5.5 to 5.7), which shows every row before anything
// saves. Words here never name another shop system (the platform's customer-facing rule); the named guides wait for
// Julian's decision 3 (code plan Phase 17).

/** "Where do you sell now?" (plan 17.3). */
export type BringAnswer = "online" | "marketplace" | "fairs" | "bookshops" | "spreadsheet" | "nowhere";

export const BRING_ANSWERS: readonly { id: BringAnswer; label: string }[] = [
  { id: "online", label: "An online shop" },
  { id: "marketplace", label: "A marketplace" },
  { id: "fairs", label: "Fairs and markets" },
  { id: "bookshops", label: "Bookshops or stockists" },
  { id: "spreadsheet", label: "A spreadsheet or list" },
  { id: "nowhere", label: "Nowhere yet" },
];

/** What the step records once it is finished or skipped. `from` is left out when the press didn't answer. */
export interface BringMarker {
  at: string;
  from?: BringAnswer;
  /** True when the press chose to start fresh (plan 17.3: starting fresh is allowed). */
  skipped?: boolean;
}

const SAVE_NOTE = "Nothing is saved until you press Import, and the preview shows every book before that.";

const HELP: Record<BringAnswer, string[]> = {
  online: [
    "In your old shop's admin, find the page where your products are listed.",
    "Look for an Export or Download option there. It saves your products as one file.",
    "Keep the file as it comes. Don't open it and save it again, because that can change the numbers.",
  ],
  marketplace: [
    "In the seller page, look for a listings or inventory download.",
    "If the marketplace only lets you download sales, not your listings, start fresh and add your books from a spreadsheet instead.",
  ],
  fairs: [
    "Fairs don't usually keep a product list, so start with your stock sheet: one row per book, with its title, its price and how many you have.",
    "Choose that spreadsheet as it is: Excel, CSV and LibreOffice files all work.",
  ],
  bookshops: [
    "You don't need your stockist list to bring books over. Export your book list from wherever you keep it, such as a spreadsheet.",
    "Choose that list as it is: Excel, CSV and LibreOffice files all work.",
  ],
  spreadsheet: [
    "Choose your spreadsheet as it is: Excel, CSV and LibreOffice files all work.",
    "The column names don't have to match exactly. Any column the shop doesn't know is listed as ignored in the preview.",
  ],
  nowhere: [
    "Nothing to bring over, so you can start fresh.",
    "You can add your first book when you're ready, or choose a spreadsheet you've started.",
  ],
};

/** The plain steps for one answer (plan 17.4), each a full sentence. The preview note is always last. */
export function bringHelp(answer: BringAnswer): string[] {
  return [...HELP[answer], SAVE_NOTE];
}

/** A value from the marker or the form, if it is one of the answers. */
export function bringAnswerOf(value: unknown): BringAnswer | undefined {
  return BRING_ANSWERS.find(a => a.id === value)?.id;
}

/** The marker to save for this step's result. */
export function bringMarker(at: string, answer: BringAnswer | "", skipped: boolean): BringMarker {
  const marker: BringMarker = { at };
  const from = bringAnswerOf(answer);
  if (from) marker.from = from;
  if (skipped) marker.skipped = true;
  return marker;
}
