// Stockists › Mark paid › "Email a receipt": asks the shop's server to email the stockist (functions/stockistReceipt.js,
// the owner's sender). Only ever called from the owner's button press. The admin fixture swaps `send`.
import { auth } from "../../../lib/firebase";
import { functionFetch } from "../../lib/functionsBase";

export type StockistReceipt = { to: string; stockistName: string; invoiceNum: string; amount: string; paidOn: string };

export const stockistReceiptApi = {
  async send(receipt: StockistReceipt): Promise<{ to: string }> {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error("Sign in again as the shop's owner.");
    const response = await functionFetch("sendTestEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: "stockistReceipt", ...receipt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `The email service answered ${response.status}. Try again in a moment.`);
    return { to: String(data.to || receipt.to) };
  },
};
