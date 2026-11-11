// Tax centre › Log a business expense › Read a receipt photo: the photo is shrunk in the browser, read by the shop's AI
// (task receiptRead in functions/aiWriter.js) and the answer fills the form. Nothing is saved until Log expense.
import { askAi } from "../aiWriter";
import type { ExpenseForm } from "./taxExpense";

export type ReceiptFacts = { vendor: string; what: string; date: string; total: string; tax: string; currency: string; number: string };

/** The form fields a receipt fills; a field the receipt didn't show keeps what was typed. Pure. */
export function receiptPatch(facts: Partial<ReceiptFacts>, currencies: string[]): Partial<ExpenseForm> {
  const patch: Partial<ExpenseForm> = {};
  const desc = [facts.vendor, facts.what].map((v) => String(v || "").trim()).filter(Boolean).join(": ");
  if (desc) patch.desc = desc;
  if (facts.date && /^\d{4}-\d{2}-\d{2}$/.test(facts.date)) patch.date = facts.date;
  if (facts.total && Number(facts.total) > 0) patch.amount = facts.total;
  if (facts.currency && currencies.includes(facts.currency)) patch.currency = facts.currency;
  if (facts.number) patch.ref = facts.number;
  return patch;
}

/** A JPEG of the photo at most 1600px on its longest side, as base64 (receipts stay readable, uploads stay small). */
async function shrink(file: File): Promise<{ imageType: string; imageData: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { imageType: "image/jpeg", imageData: url.slice(url.indexOf(",") + 1) };
}

export async function readReceipt(file: File): Promise<ReceiptFacts> {
  if (!/^image\//.test(file.type)) throw new Error("Choose a photo of the receipt.");
  return (await askAi("receiptRead", await shrink(file))) as ReceiptFacts;
}
