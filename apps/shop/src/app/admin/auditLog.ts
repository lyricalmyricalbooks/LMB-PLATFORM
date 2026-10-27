// The admin audit log (the `audit-log` collection, listed under the shell's History). It sits in its own file so the
// modules adminApi itself uses (themeStore) can write to it without importing api.ts back, which made a loop.
// adminApi.recordAuditLog / getAuditLog hand on to it.
import { addDoc, collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";

export const auditLog = {
  record: async (type: string, message: string) => {
    try {
      await addDoc(collection(db, "audit-log"), {
        type,
        message,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn("Could not save audit log:", err);
    }
  },
  list: async (limitCount = 100) => {
    const q = query(collection(db, "audit-log"), orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
};
