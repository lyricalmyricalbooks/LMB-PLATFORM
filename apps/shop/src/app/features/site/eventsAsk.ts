// One request to the events server (functions/events.js `handlePublic`). Studio's preview gets sample answers and
// never sells anything (eventsPreview.ts).
import type { User } from "firebase/auth";
import { functionFetch } from "../../lib/functionsBase";
import { shopCurrency } from "../../../lib/shopProfile";
import { isBookingPreview } from "./bookTimePreview";
import { previewEventsAnswer } from "./eventsPreview";

export type EventsAnswer = Record<string, any> & { error?: string; code?: string };

export async function askEvents(action: "eventsInfo" | "eventStart" | "eventView" | "eventCode", body: Record<string, unknown> = {}, user?: User | null): Promise<EventsAnswer> {
  if (isBookingPreview()) return previewEventsAnswer(action, body, shopCurrency());
  // A signed-in member's proof, for tickets members book first (the server checks the membership).
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  const response = await functionFetch("validateDiscountCode", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || response.status)), { code: data.code, status: response.status });
  return data;
}
