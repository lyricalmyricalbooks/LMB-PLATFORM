// Order page › an invoice's card pay link (/track?invoicePay=<link>): the shop's stockroom invoice or settle-up, paid on
// the shop's own card page. The server keeps the amount (functions/invoicePay.js); this page only asks it for a card page.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { functionFetch } from "../../lib/functionsBase";
import { getCopy } from "./storeCopy";

type View = { label: string; amountMinor: number; currency: string; paid: boolean; open: boolean };

async function ask(token: string, op?: "open"): Promise<View & { url?: string; error?: string; code?: string }> {
  const response = await functionFetch("createStripeCheckoutSession", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "invoicePayOpen", token, ...(op ? { op } : {}) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(String(data.error || "")), { code: data.code, data });
  return data;
}

export function InvoicePay({ token, design }: { token: string; design: any }) {
  const [view, setView] = useState<View | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "opening" | "missing">("loading");
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let cancelled = false;
    ask(token).then((v) => { if (!cancelled) { setView(v); setState("ready"); } }).catch(() => { if (!cancelled) setState("missing"); });
    return () => { cancelled = true; };
  }, [token]);
  if (state === "loading") return null;
  const amount = view ? new Intl.NumberFormat(undefined, { style: "currency", currency: view.currency }).format(view.amountMinor / 100) : "";
  const vars = { label: view?.label || "", amount };
  const words = state === "missing" || !view ? getCopy(design, "trackInvoiceClosed")
    : view.paid ? getCopy(design, "trackInvoicePaid", vars)
      : view.open ? getCopy(design, "trackInvoiceText", vars) : getCopy(design, "trackInvoiceClosed");
  const canPay = !!view && view.open && !view.paid;
  const pay = async () => {
    if (state === "opening") return;
    setState("opening");
    setFailed("");
    try {
      const opened = await ask(token, "open");
      if (opened.url) { window.location.href = opened.url; return; }
      setView(opened);
      setState("ready");
    } catch (err: any) {
      setFailed(err?.code && err?.message ? err.message : getCopy(design, "trackPayError"));
      setState("ready");
    }
  };
  return (
    <div role="status" className="fm-track-notice mb-6" data-tone={view?.paid ? undefined : canPay ? "warning" : "danger"}
      data-studio-target="copy:Order tracking" data-studio-label="Invoice payment">
      <div>
        <p translate="no">{words}</p>
        {failed && <p role="alert" style={{ marginTop: 8 }}><strong>{failed}</strong></p>}
      </div>
      {canPay && (
        <button type="button" onClick={pay} disabled={state === "opening"} className="fm-track-btn">
          {state === "opening" && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {getCopy(design, state === "opening" ? "trackPayOpening" : "trackPayNow")}
        </button>
      )}
    </div>
  );
}
