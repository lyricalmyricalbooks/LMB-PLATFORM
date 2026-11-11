// One shared way for the Tax centre cards to save: through `stockroomWriteApi.updateSetting("taxCenter", …)` (WRITING.md),
// returning the note to show. The result is never discarded: saved, saved with a conflict, refused and failed all say so.
import { describeResult, stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;
export type SaveNote = { tone: "ok" | "warn" | "error" | "busy"; text: string };

export async function saveTaxCenter(mutate: (current: Row | null) => Row, done: string): Promise<{ ok: boolean; taxCenter?: Row; note: SaveNote }> {
  try {
    const result = await stockroomWriteApi.updateSetting("taxCenter", (current) => mutate(current as Row | null));
    if (result.status === "saved" || result.status === "unchanged") {
      const d = describeResult(result);
      return { ok: true, taxCenter: (result.value as Row) || {}, note: { tone: d.tone, text: d.tone === "ok" && !result.merged ? done : d.text } };
    }
    return { ok: false, note: { tone: "error", text: describeResult(result).text } };
  } catch (error) {
    console.error("Tax centre save failed", error);
    return { ok: false, note: { tone: "error", text: "That didn't save. Nothing was changed." } };
  }
}
