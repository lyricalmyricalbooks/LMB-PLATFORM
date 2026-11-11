// Stockroom › Sheets' "Copy sales to sheet" switch, kept on the shop's account in the admin-only `adminPrefs/sheets`
// (the same shape and rule as the Overview's boards and the QR codes: `{ data: JSON string, updatedAt }`).
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { readCopySwitch } from "./sheets";

const REMOTE = () => doc(db, "adminPrefs", "sheets");

export const sheetsStore = {
  async load(): Promise<boolean> {
    const snap = await getDoc(REMOTE());
    return snap.exists() ? readCopySwitch((snap.data() as { data?: unknown }).data) : true;
  },
  async save(copy: boolean): Promise<void> {
    await setDoc(REMOTE(), { data: JSON.stringify({ copy }), updatedAt: Date.now() });
  },
};
