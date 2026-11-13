// Customers' saved groups, kept on the shop's account in the admin-only `adminPrefs/customerGroups` (the same shape and
// rule as the Overview's boards and the QR codes: `{ data: JSON string, updatedAt }`).
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { readGroups, type CustomerGroup } from "./customerGroups";

const REMOTE = () => doc(db, "adminPrefs", "customerGroups");

export const customerGroupsStore = {
  async load(): Promise<CustomerGroup[]> {
    const snap = await getDoc(REMOTE());
    return snap.exists() ? readGroups((snap.data() as { data?: unknown }).data) : [];
  },
  async save(groups: CustomerGroup[]): Promise<void> {
    await setDoc(REMOTE(), { data: JSON.stringify(groups), updatedAt: Date.now() });
  },
};
