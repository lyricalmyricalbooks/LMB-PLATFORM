// Orders › an order › Store credit (gap list 18): one click opens the gift card form, filled in for this customer.
import { useState } from "react";
import toast from "react-hot-toast";
import { SecondaryButton, SectionCard } from "./riso/components";
import { IssueDialog } from "./GiftCards";
import { canGiveCredit, creditForm } from "./storeCredit";

export function StoreCreditCard({ order }: { order: any }) {
  const [open, setOpen] = useState(false);
  if (!canGiveCredit(order)) return null;
  return (
    <SectionCard title="Store credit">
      <p className="fw-summary">Give this customer credit to spend in your shop, for example instead of a refund.</p>
      <SecondaryButton size="sm" onClick={() => setOpen(true)}>Give store credit</SecondaryButton>
      {open && <IssueDialog credit initial={creditForm(order)} onClose={() => setOpen(false)} onIssued={() => toast.success("Store credit created. It's listed in Gift cards.")} />}
    </SectionCard>
  );
}
