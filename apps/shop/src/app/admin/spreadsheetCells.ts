// What the spreadsheet readers share (plans 23.35, 23.40): errors the owner can act on, size limits, and how a cell's
// number or date becomes the text the windows read.

export class SpreadsheetError extends Error {}

export const MAX_CELLS = 2_000_000;
export const TOO_LARGE = "This file is too large to read here. Save a shorter part of it and bring the parts one at a time.";

/** A workbook's sheets, each read only when asked for. */
export type Book = { sheets: { name: string; hidden: boolean; rows: () => Promise<string[][]> }[] };

/** A number as a spreadsheet shows it: 15 significant digits, so 0.1 + 0.2 reads 0.3. */
export const numberText = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v;
};

const BUILT_IN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
/** Excel's own number formats that show a date or time. */
export const isBuiltInDate = (id: number) => BUILT_IN_DATES.has(id);

/** A custom number format that shows a date or time ("dd/mm/yyyy", "mmm d", "h:mm"), not one with only months' "m". */
export function isDateCode(code: string): boolean {
  if (!code) return false;
  const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dy]/i.test(bare) || /(^|[^a-z])m+([^a-z]|$)/i.test(bare) && /[dhys]/i.test(bare);
}

/** Day 0 of a workbook: 30 December 1899, or 1 January 1904 for workbooks made on old Macs. */
export const excelEpoch = (is1904: boolean) => (is1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30));

/** A date cell as YYYY-MM-DD, with the time when it has one. */
export function excelDate(serial: number, epoch: number): string {
  if (!Number.isFinite(serial)) return "";
  const ms = epoch + Math.round(serial * 86_400_000);
  const iso = new Date(ms).toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 19)}`;
}

/** 0.15 → "15%", the way a percent cell shows it (Excel and OpenDocument keep the fraction). */
export const percentText = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${numberText(String(n * 100))}%` : v;
};

/** Excel's built-in percent formats (0% and 0.00%). */
export const isBuiltInPercent = (id: number) => id === 9 || id === 10;

/** A custom number format that shows a percent: a % outside quoted text, [colour] parts and escaped characters. */
export const isPercentCode = (code: string) => /%/.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));
