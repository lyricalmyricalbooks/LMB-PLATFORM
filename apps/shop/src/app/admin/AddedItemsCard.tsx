// Order page › Added items (code plan 24.6, part B). Items added to a paid order are a second order the customer pays from
// a link (`shipsWith` names the first). On the first order this lists what was added and whether it's paid; on the added
// order it says which order to pack it with. Both go in one parcel.
import "./fulfillment.css";
import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { linkState } from "./paymentLinks";
import { SecondaryButton, SectionCard, StatusBadge } from "./riso/components";

const STATE = {
  open: { tone: "warning", text: "Waiting for payment" },
  expired: { tone: "danger", text: "Link expired" },
  paid: { tone: "success", text: "Paid" },
  cancelled: { tone: "neutral", text: "Closed" },
} as const;

const itemsText = (o: any) => (o.items || []).map((i: any) => `${i.quantity} × ${i.title || "Item"}`).join(", ");

export function AddedItemsCard({ order, onOpen }: { order: any; onOpen?: (id: string) => void }) {
  const [added, setAdded] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    setAdded([]);
    if (!order?.id || order.shipsWith) return;
    adminApi.getOrdersShippingWith(order.id).then(list => { if (alive) setAdded(Array.isArray(list) ? list : []); }, () => {});
    return () => { alive = false; };
  }, [order?.id, order?.shipsWith]);

  if (order?.shipsWith) {
    return (
      <SectionCard title="Ships with another order">
        <p className="fw-summary">These items were added to an order the customer already paid for. Pack and send them together, in one parcel.</p>
        {onOpen && <SecondaryButton size="sm" onClick={() => onOpen(order.shipsWith)}>Open the first order</SecondaryButton>}
      </SectionCard>
    );
  }
  if (!added.length) return null;
  return (
    <SectionCard title="Items added later">
      <p className="fw-summary">The customer added these after paying. Pack the paid ones in the same parcel as this order.</p>
      <ul className="rp-stack" style={{ gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
        {added.map(o => {
          const state = linkState(o) || "open";
          return (
            <li key={o.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ minWidth: 0 }}>{itemsText(o) || o.orderId || o.id}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusBadge tone={STATE[state].tone}>{STATE[state].text}</StatusBadge>
                {onOpen && <SecondaryButton size="sm" onClick={() => onOpen(o.id)}>Open</SecondaryButton>}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
