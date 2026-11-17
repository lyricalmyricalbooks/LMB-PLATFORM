// One request to the bookings server for the Timetable page (functions/bookings.js `handlePublic`, action
// `classTimetable`). Studio's preview gets a sample week (classesPreview.ts).
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview } from "./bookTimePreview";
import { previewTimetable } from "./classesPreview";
import type { TimetableInfo } from "./classesRules";

export async function askTimetable(from = ""): Promise<TimetableInfo> {
  const body = from ? { from } : {};
  if (isBookingPreview()) return previewTimetable(body, shopCurrency());
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "classTimetable", ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}
