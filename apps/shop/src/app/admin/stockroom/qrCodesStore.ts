// Stockroom › QR codes' own codes (New code), kept on the shop's account in the admin-only `adminPrefs/qrCodes`
// (the same shape and rule as the Overview's boards and notes: `{ data: JSON string, updatedAt }`).
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { cleanOwnCodes, type OwnCode } from "./qrCodes";

const REMOTE = () => doc(db, "adminPrefs", "qrCodes");

export const qrCodesStore = {
  async load(): Promise<OwnCode[]> {
    const snap = await getDoc(REMOTE());
    return snap.exists() ? cleanOwnCodes((snap.data() as { data?: unknown }).data) : [];
  },
  async save(codes: OwnCode[]): Promise<void> {
    await setDoc(REMOTE(), { data: JSON.stringify(cleanOwnCodes(codes)), updatedAt: Date.now() });
  },
};

/** The code's picture: a GIF data address drawn in the browser (nothing is sent anywhere). */
export async function qrPicture(url: string, cell = 6): Promise<string> {
  const { default: qrcode } = await import("qrcode-generator");
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createDataURL(cell, 4);
}
