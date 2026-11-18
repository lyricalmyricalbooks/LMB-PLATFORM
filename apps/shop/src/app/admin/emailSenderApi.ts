// Settings › Email sender's two reads that the admin fixture swaps for sample data (`admin-fixture.html?emails=…`):
// the delivery list (`emailLog`, newest first) and the email server's actions. Nothing else changes here.
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { emailFunction } from "./notificationApi";

export const emailSenderData = {
  /** The newest `count` delivery rows. */
  readLog: async (count: number): Promise<Array<Record<string, any> & { id: string }>> => {
    const snap = await getDocs(query(collection(db, "emailLog"), orderBy("at", "desc"), limit(count)));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));
  },
  /** One email server action (send a test, the retry queue, retry, stop, sender status). */
  call: (body: Record<string, unknown>): Promise<any> => emailFunction(body),
};
