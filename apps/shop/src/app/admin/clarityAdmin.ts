import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cleanClarityId, clarityUrls } from "../lib/clarity";

// Microsoft Clarity for the admin. The project ID is public (shoppers' browsers load Clarity's tag with it, lib/clarity.ts)
// and lives at settings/website.analytics.clarityProjectId. Only Settings › General › Microsoft Clarity writes it, one
// field at a time, so the Google Analytics ID beside it is never touched (and adminApi.updateSettings never writes
// `analytics` at all).

export { cleanClarityId, clarityUrls };

/** The saved project ID from a settings object (admin or public), cleaned; "" when none. */
export const clarityIdOf = (settings: any): string => cleanClarityId(settings?.analytics?.clarityProjectId);

export const clarityApi = {
  load: async (): Promise<string> => {
    const snap = await getDoc(doc(db, "settings", "website"));
    return snap.exists() ? clarityIdOf(snap.data()) : "";
  },
  /** Saves the project ID ("" switches Clarity off). Only `analytics.clarityProjectId` is written. */
  save: (projectId: string) =>
    setDoc(doc(db, "settings", "website"), { analytics: { clarityProjectId: cleanClarityId(projectId) } }, { mergeFields: ["analytics.clarityProjectId"] }),
};

/** Where the setup lives, for messages that point at it. */
export const CLARITY_SETTINGS_PATH = "Settings › General › Microsoft Clarity";
