import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { getCopy } from "../../storeCopy";
import { regionProps } from "../../storefrontRegions";
import { submitContactMessage } from "../../contactMessages";
import { inEditorPreview } from "../../../../lib/trackingGuard";
import { questionProblem, questionSubject } from "./askQuestion";

// "Ask a question about this book" under the buy buttons (Studio › Style › Book page · photos & layout ›
// showPdpAskQuestion, off by default). A folded form that sends one `contactMessages` row — the same path as the
// Contact form section — so the question lands in Admin › Messages (reply from there) and the shop's usual
// "new message" email. The Studio preview never sends. Words: Text & labels › Product page (`pdpAsk*`).
export default function PdpAskQuestion({ design, title, edition }: { design: any; title: string; edition?: string }) {
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "invalid" | "failed">("idle");
  const set = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const field = "fm-pdp-alert-input w-full rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-sm outline-none focus:border-white/40";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    // Bots fill the hidden field; pretend success so they move on.
    if (form.website || inEditorPreview()) { setStatus("sent"); return; }
    if (questionProblem(form)) { setStatus("invalid"); return; }
    setStatus("sending");
    try {
      await submitContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: questionSubject(getCopy(design, "pdpAskSubject"), title, edition),
        message: form.message.trim(),
        page: typeof window !== "undefined" ? window.location.pathname : "",
      });
      setStatus("sent");
    } catch (err) {
      console.error("Book question failed", err);
      setStatus("failed");
    }
  };

  return (
    <div {...regionProps("productAskQuestion")} className="fm-pdp-ask w-full flex items-start gap-2.5 text-left">
      <MessageCircleQuestion size={14} aria-hidden="true" className="shrink-0 mt-0.5" />
      <details className="fm-pdp-ask-details min-w-0 flex-1 text-[12px]">
        <summary className="fm-pdp-meta cursor-pointer underline underline-offset-2 w-fit">{getCopy(design, "pdpAskToggle")}</summary>
        {status === "sent" ? (
          <p role="status" className="mt-2 text-sm opacity-80">{getCopy(design, "pdpAskSent")}</p>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-2" noValidate>
            {getCopy(design, "pdpAskIntro").trim() && <p className="text-white/50">{getCopy(design, "pdpAskIntro")}</p>}
            {/* Honeypot: hidden from people, filled in by spam bots. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set("website")} />
            <input type="text" maxLength={120} autoComplete="name" aria-label={getCopy(design, "pdpAskName")} placeholder={getCopy(design, "pdpAskName")} value={form.name} onChange={set("name")} className={field} />
            <input type="email" maxLength={254} autoComplete="email" aria-label={getCopy(design, "pdpAskEmail")} placeholder={getCopy(design, "pdpAskEmail")} value={form.email} onChange={set("email")} className={field} />
            <textarea maxLength={5000} rows={4} aria-label={getCopy(design, "pdpAskMessage")} placeholder={getCopy(design, "pdpAskMessage")} value={form.message} onChange={set("message")} className={`${field} resize-y`} />
            <button
              type="submit"
              disabled={status === "sending"}
              className="fm-pdp-alert-btn w-fit rounded-xl border border-white/30 px-5 py-3 text-[11px] font-black tracking-[0.2em] uppercase transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {getCopy(design, status === "sending" ? "pdpAskSending" : "pdpAskSend")}
            </button>
            {(status === "invalid" || status === "failed") && (
              <p role="alert" className="text-xs opacity-80">{getCopy(design, status === "failed" ? "pdpAskFailed" : "pdpAskInvalid")}</p>
            )}
          </form>
        )}
      </details>
    </div>
  );
}
