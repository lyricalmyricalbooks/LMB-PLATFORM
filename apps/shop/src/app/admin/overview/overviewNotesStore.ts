// The owner's notes on the Overview's "Sales with your notes" widget ("Instagram reel", "Book fair"): one admin-only
// document, `adminPrefs/overviewNotes`, holding the list as a JSON string (the same shape and rule as the boards,
// overviewBoardStore.ts). Nothing here is shop data; losing it only loses the notes.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { cleanNotes, type SalesNote } from "./overviewNewLive";

const REMOTE = () => doc(db, "adminPrefs", "overviewNotes");
/** Rules cap the payload at 200 KB; 200 short notes stay far under it. */
export const MAX_NOTES_BYTES = 180_000;

export async function readNotes(): Promise<SalesNote[]> {
  const snap = await getDoc(REMOTE());
  if (!snap.exists()) return [];
  const data = snap.data() as { data?: string };
  if (typeof data?.data !== "string") return [];
  try { return cleanNotes(JSON.parse(data.data)); } catch { return []; }
}

export async function writeNotes(notes: SalesNote[]): Promise<SalesNote[]> {
  const clean = cleanNotes(notes);
  const data = JSON.stringify(clean);
  if (data.length > MAX_NOTES_BYTES) throw new Error("Too many notes to save. Delete some older ones first.");
  await setDoc(REMOTE(), { data, updatedAt: Date.now() });
  return clean;
}
