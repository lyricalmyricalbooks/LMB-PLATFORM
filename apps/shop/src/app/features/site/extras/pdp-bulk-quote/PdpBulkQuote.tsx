import { useState } from "react";
import { Boxes } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { submitContactMessage } from "../../contactMessages";
import { inEditorPreview } from "../../../../lib/trackingGuard";
import { quoteMessage, quoteProblem, quoteSubject } from "./bulkQuote";

// "Ask for a bulk quote" under the buy buttons (Studio › Style › Book page · photos & layout › showPdpBulkQuote, off by
// default). A folded form that sends one `contactMessages` row, the same path as the Contact form section and the book
// question form, so the request lands in Admin › Messages. The Studio preview never sends. Words: Text & labels ›
// Product page (`pdpQuote*`).
export default function PdpBulkQuote({ design, title, edition }: { design: any; title: string; edition?: string }) {
  const [form, setForm] = useState({ name: "", email: "", quantity: "", note: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "invalid" | "failed">("idle");
  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = "fm-pdp-alert-input w-full rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-sm outline-none focus:border-white/40";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    // Bots fill the hidden field; pretend success so they move on.
    if (form.website || inEditorPreview()) { setStatus("sent"); return; }
    if (quoteProblem(form)) { setStatus("invalid"); return; }
    setStatus("sending");
    try {
      await submitContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: quoteSubject(getCopy(design, "pdpQuoteSubject"), title, edition),
        message: quoteMessage(form, title),
        page: typeof window !== "undefined" ? window.location.pathname : "",
      });
      setStatus("sent");
    } catch (err) {
      console.error("Bulk quote failed", err);
      setStatus("failed");
    }
  };

  return (
    <div {...regionProps("productBulkQuote")} className="fm-pdp-ask w-full flex items-start gap-2.5 text-left">
      <Boxes size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <details className="fm-pdp-ask-details min-w-0 flex-1 text-[12px]">
        <summary className="fm-pdp-meta cursor-pointer underline underline-offset-2 w-fit">{getCopy(design, "pdpQuoteToggle")}</summary>
        {status === "sent" ? (
          <p role="status" className="mt-2 text-sm opacity-80">{getCopy(design, "pdpQuoteSent")}</p>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2" noValidate>
            {getCopy(design, "pdpQuoteIntro").trim() && <p className="text-white/50">{getCopy(design, "pdpQuoteIntro")}</p>}
            {/* Honeypot: hidden from people, filled in by spam bots. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />
            <input type="text" maxLength={120} autoComplete="name" aria-label={getCopy(design, "pdpQuoteName")} placeholder={getCopy(design, "pdpQuoteName")} value={form.name} onChange={set("name")} className={field} />
            <input type="email" maxLength={254} autoComplete="email" aria-label={getCopy(design, "pdpQuoteEmail")} placeholder={getCopy(design, "pdpQuoteEmail")} value={form.email} onChange={set("email")} className={field} />
            <input type="number" inputMode="numeric" min={1} aria-label={getCopy(design, "pdpQuoteQuantity")} placeholder={getCopy(design, "pdpQuoteQuantity")} value={form.quantity} onChange={set("quantity")} className={field} />
            <textarea maxLength={3000} rows={3} aria-label={getCopy(design, "pdpQuoteNote")} placeholder={getCopy(design, "pdpQuoteNote")} value={form.note} onChange={set("note")} className={`${field} resize-y`} />
            <button
              type="submit"
              disabled={status === "sending"}
              className="fm-pdp-alert-btn w-fit rounded-xl border border-white/30 px-5 py-3 text-[11px] font-black tracking-[0.2em] uppercase transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {getCopy(design, status === "sending" ? "pdpQuoteSending" : "pdpQuoteSend")}
            </button>
            {(status === "invalid" || status === "failed") && (
              <p role="alert" className="text-xs opacity-80">{getCopy(design, status === "failed" ? "pdpQuoteFailed" : "pdpQuoteInvalid")}</p>
            )}
          </form>
        )}
      </details>
    </div>
  );
}
