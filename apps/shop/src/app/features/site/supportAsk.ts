// One request to the giving server (functions/giving.js `handlePublic`). Studio's preview gets sample answers and never
// opens a card page (supportPreview.ts).
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview } from "./bookTimePreview";
import { previewGivingAnswer } from "./supportPreview";

export type GivingAnswer = Record<string, any> & { error?: string; code?: string };

export async function askGiving(action: "givingInfo" | "giftStart" | "giftView" | "pledgeView" | "pledgeEnd", body: Record<string, unknown> = {}): Promise<GivingAnswer> {
  if (isBookingPreview()) return previewGivingAnswer(action, body, shopCurrency());
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}
