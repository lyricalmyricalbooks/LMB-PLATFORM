// A receipt file for the Tax centre, saved where the stockroom saves its own (apps/stockroom/src/firebase.js
// `_fbUploadReceipt`): the stockroom's bucket, `shops/<shop>/receipts/<folder>/<time>_<name>`. Its storage rules allow
// the owner, images and PDFs under 15 MB; the same limits are checked here first so the owner hears why in plain words.
import { app } from "../../../lib/firebase";
import { shopFilePath } from "../../../lib/shopFolder";
import { stockroomPlace } from "./stockroomData";

export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;

/** Why this file can't be a receipt, or null when it can. */
export function receiptProblem(file: { type: string; size: number }): string | null {
  if (!/^image\//.test(file.type) && file.type !== "application/pdf") return "A receipt has to be a photo or a PDF.";
  if (file.size >= RECEIPT_MAX_BYTES) return "That file is over 15 MB. Try a smaller photo or PDF.";
  return null;
}

/** Where a receipt goes in the shop's folder. Only letters, digits, dots, dashes and underscores survive in the name. */
export function receiptPath(name: string, now: number, folder = "General"): string {
  const clean = name.replace(/[^a-zA-Z0-9.\-_]/g, "") || "receipt";
  const safeFolder = folder.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "General";
  return shopFilePath(`receipts/${safeFolder}/${now}_${clean}`);
}

/** Uploads a receipt and returns its address. Throws with a plain sentence when the file can't be one. */
export async function uploadReceipt(file: File, now = Date.now()): Promise<string> {
  const problem = receiptProblem(file);
  if (problem) throw new Error(problem);
  // Loaded on first use, like the admin's other uploads, so file storage stays out of the admin's first load.
  const { getDownloadURL, getStorage, ref, uploadBytes } = await import("firebase/storage");
  const bucket = stockroomPlace().storageBucket;
  const storage = bucket ? getStorage(app, `gs://${bucket}`) : getStorage(app);
  const target = ref(storage, receiptPath(file.name, now));
  await uploadBytes(target, file, { contentType: file.type });
  return getDownloadURL(target);
}
