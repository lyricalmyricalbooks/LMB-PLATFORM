import { auth } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";

/** Admin-only calls to the sendTestEmail function: test sends, the retry queue and the Gmail check. */
export async function emailFunction(body: Record<string, unknown>) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again as the shop administrator.");
  const response = await functionFetch("sendTestEmail", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `The email service answered ${response.status}. Check that Cloud Functions are deployed.`);
  return data;
}

/** The newest Gmail attempt in the delivery log, when Gmail refused it (the backup sender was used). */
export function lastGmailProblem(rows: Array<{ keySource?: string; status?: string; error?: string; at?: string }>): { at?: string; error: string } | null {
  const newest = rows.find((r) => r?.keySource === "gmail");
  return newest && newest.status === "fallback" ? { at: newest.at, error: String(newest.error || "Gmail refused the last email.") } : null;
}
