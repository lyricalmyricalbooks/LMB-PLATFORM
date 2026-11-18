// Types that need a check (product types plan, round 2; rules in src/shared/typeApproval.ts). The admin follows the
// control room's answers (platform/approvals, admin-read, never written here) and the owner's own ask
// (approvalRequests/{typeId}). One object so the admin fixture can swap in sample answers.
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { approvalAsk, approvalStatus, type ApprovalRequest, type Approvals } from "../../shared/typeApproval";

export const typeApprovalData = {
  watchAnswers(onChange: (approvals: Approvals) => void): () => void {
    return onSnapshot(doc(db, "platform", "approvals"), (snap) => onChange(snap.exists() ? (snap.data() as Approvals) : null), () => onChange(null));
  },
  watchAsk(typeId: string, onChange: (ask: ApprovalRequest) => void): () => void {
    return onSnapshot(doc(db, "approvalRequests", typeId), (snap) => onChange(snap.exists() ? (snap.data() as ApprovalRequest) : null), () => onChange(null));
  },
  async ask(typeId: string, typeName: string, note: string): Promise<void> {
    await setDoc(doc(db, "approvalRequests", typeId), approvalAsk(typeId, typeName, note, new Date().toISOString()));
  },
};

/** Where this product's check stands, kept up to date; null when its type needs none. */
export function useTypeApproval(product: unknown) {
  const [answers, setAnswers] = useState<Approvals>(null);
  const [ask, setAsk] = useState<ApprovalRequest>(null);
  const status = approvalStatus(product, answers, ask);
  const typeId = status?.typeId || "";
  useEffect(() => (typeId ? typeApprovalData.watchAnswers(setAnswers) : undefined), [typeId]);
  useEffect(() => (typeId ? typeApprovalData.watchAsk(typeId, setAsk) : undefined), [typeId]);
  return status;
}
