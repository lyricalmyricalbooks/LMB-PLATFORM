// Stockroom › Shipping › Buy label: the order page's label step (LabelBuyer + useLabelPurchase, the same server purchase
// with its duplicate-purchase claim) in a dialog, with one confirm before any money is spent.
import { useCallback, useEffect, useState } from "react";

import { adminApi } from "../api";
import { dispatchProblem, suggestedParcelWeightGrams } from "../fulfillment";
import { LabelBuyer, price } from "../LabelBuyer";
import { Dialog, ErrorState, LoadingState, PrimaryButton, SecondaryButton } from "../riso/components";
import { useLabelPurchase } from "../useLabelPurchase";
import "../fulfillment.css";

type Props = {
  /** The website order's id; the dialog is open while it is set. */
  orderId: string;
  /** What the row shows as its number ("#WEB-1041"). */
  title: string;
  onClose: () => void;
  /** The label was bought: the row can leave the waiting list. */
  onBought: (orderId: string) => void;
};

export function ShipLabelDialog({ orderId, title, onClose, onBought }: Props) {
  const [order, setOrder] = useState<any>(undefined);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const read = useCallback(async () => {
    setFailed(false);
    try { setOrder(await adminApi.getOrderById(orderId)); } catch (err) { console.error(err); setFailed(true); }
  }, [orderId]);
  useEffect(() => { void read(); }, [read]);
  const label = useLabelPurchase(orderId, order || null, read);
  const picked = label.rates.find((r) => r.id === label.selectedRate);

  const buy = async () => {
    setConfirming(false);
    if (await label.buy()) { onBought(orderId); onClose(); }
  };

  const problem = order ? dispatchProblem(order) : "";
  let body;
  if (failed) body = <ErrorState title="The order didn't load" description="Check your connection, then try again." onRetry={() => void read()} />;
  else if (order === undefined) body = <LoadingState label="Loading the order…" />;
  else if (!order) body = <p className="rp-card-desc" style={{ margin: 0 }}>This order isn't in the website's orders. Buy its label where it was sold.</p>;
  else if (confirming && picked) body = (
    <div className="sk-label-confirm" role="alertdialog" aria-label="Confirm the label">
      <p style={{ margin: 0 }}><strong>Buy {picked.name} for {price(picked)}?</strong></p>
      <p className="rp-hint" style={{ margin: 0 }}>It's charged to your shipping account now. A wrong label can be voided from the order's page before the parcel leaves.</p>
    </div>
  );
  else body = (
    <>
      {problem && (
        <p className="fw-problems" role="alert">
          {problem} <a href={`#orders/${encodeURIComponent(orderId)}`}>Open the order</a>
        </p>
      )}
      <LabelBuyer
        order={order}
        parcel={label.parcel}
        onParcel={label.changeParcel}
        presets={label.presets}
        onPreset={label.pickPreset}
        suggestedWeight={suggestedParcelWeightGrams(order)}
        rates={label.rates}
        searched={label.searched}
        selectedRate={label.selectedRate}
        onSelectRate={label.setSelectedRate}
        finding={label.finding}
        buying={label.buying}
        busy={false}
        problem={problem}
        onFindRates={() => void label.findRates()}
        onBuy={() => setConfirming(true)}
        onSavePreset={label.savePreset}
      />
    </>
  );

  return (
    <Dialog open onClose={label.buying ? () => {} : onClose} title={`Label for ${title}`} description={order?.customer?.name || undefined}
      footer={confirming && picked ? (
        <>
          <SecondaryButton data-autofocus disabled={label.buying} onClick={() => setConfirming(false)}>Back</SecondaryButton>
          <PrimaryButton busy={label.buying} disabled={label.buying} onClick={() => void buy()}>{label.buying ? "Buying label…" : `Yes, buy · ${price(picked)}`}</PrimaryButton>
        </>
      ) : undefined}>
      {body}
    </Dialog>
  );
}
