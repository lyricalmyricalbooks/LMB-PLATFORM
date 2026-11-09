// Bring a Google Sheet in by its link (plan 23.42). The platform's Google link reads it with the shop's one Google
// sign-in (the Drive box asks for reading too), so nothing is downloaded or shared first. The sheet comes back as a
// stand-in file: every bring-a-file window takes it, offers its other tabs and reads it like any spreadsheet.

import { googleConnectApi } from "./googleConnect";
import { SpreadsheetError, readThrough, toCsv, type SpreadsheetRead } from "./spreadsheetFile";

/** The sheet's id and, when the link points at one tab, that tab's number. Null for anything that isn't a sheet link. */
export function parseSheetLink(text: string): { spreadsheetId: string; gid?: number } | null {
  const match = String(text || "").trim().match(/^(?:https:\/\/)?docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,128})(?:[/?#]|$)/);
  if (!match) return null;
  const gid = String(text).match(/[#&?]gid=(\d{1,12})/);
  return { spreadsheetId: match[1], ...(gid ? { gid: Number(gid[1]) } : {}) };
}

export const NOT_A_SHEET = "Paste the link of a Google Sheet. It starts with docs.google.com/spreadsheets.";

/**
 * Reads the sheet and hands back a file standing in for it, or "allow" when Google hasn't been asked for reading yet
 * (the shop connected before this was added, or the box was unticked on Google's page).
 */
export async function openGoogleSheet(link: string): Promise<File | "allow"> {
  const asked = parseSheetLink(link);
  if (!asked) throw new SpreadsheetError(NOT_A_SHEET);
  const read = async (args: { sheet?: string; gid?: number }) => {
    let answer: any;
    try {
      answer = await googleConnectApi.readSheet({ spreadsheetId: asked.spreadsheetId, ...args });
    } catch (err: any) {
      throw new SpreadsheetError(err?.message || "Google didn't answer. Try again in a minute.");
    }
    if (answer?.available !== true) return "allow" as const;
    const rows: string[][] = Array.isArray(answer.rows) ? answer.rows.map((r: unknown) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])) : [];
    const result: SpreadsheetRead = { text: toCsv(rows), sheet: String(answer.sheet ?? ""), sheets: Array.isArray(answer.sheets) ? answer.sheets.map(String) : [] };
    return { title: String(answer.title || "Google Sheet"), result };
  };
  const first = await read(asked.gid !== undefined ? { gid: asked.gid } : {});
  if (first === "allow") return "allow";
  const file = new File([first.result.text], first.title, { type: "text/csv" });
  return readThrough(file, async (sheet) => {
    if (sheet === undefined || sheet === first.result.sheet) return first.result;
    const again = await read({ sheet });
    if (again === "allow") throw new SpreadsheetError("Google stopped letting the shop read sheets. Bring the sheet in again.");
    return again.result;
  });
}
