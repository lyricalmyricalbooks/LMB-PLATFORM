import { useState } from "react";
import { lite } from "../../../lib/lite";
import { getCopy } from "./storeCopy";
import { inEditorPreview } from "../../lib/trackingGuard";
import { ga4Event } from "../../lib/ga4";

export function isValidAlertEmail(value: string) {
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value.trim()) && value.length <= 254;
}

/** The alert's document id; firestore.rules requires exactly this shape, so one address gets one alert per edition. */
export function stockAlertId(email: string, bookId: string, variantId = "") {
  return `${email.trim().toLowerCase()}__${bookId}__${variantId}`;
}

/**
 * Saves one alert. The Studio preview runs the real storefront, so there it writes nothing (an alert would email the
 * owner's test address at the next restock). One alert per address + book + edition (the id): asking twice is done.
 * The fields are kept inside firestore.rules' limits, so a "permission-denied" answer means the alert already
 * exists (shoppers may create, never overwrite); every other failure (network, unavailable…) is thrown.
 */
export async function saveStockAlert(input: { email: string; bookId: string; bookTitle: string; variantId?: string; variantName?: string }): Promise<void> {
  if (inEditorPreview()) return;
  const clean = input.email.trim().toLowerCase();
  const { doc, setDoc, liteDb } = await lite();
  await setDoc(doc(liteDb, "stockAlerts", stockAlertId(clean, input.bookId, input.variantId || "")), {
    email: clean,
    bookId: input.bookId,
    bookTitle: String(input.bookTitle || "").slice(0, 300),
    variantId: input.variantId || "",
    variantName: String(input.variantName || "").slice(0, 120),
    status: "waiting",
    createdAt: new Date().toISOString(),
  }).catch((err: any) => { if (err?.code !== "permission-denied") throw err; });
  ga4Event("back_in_stock_signup", { items: [{ item_id: input.bookId, item_name: String(input.bookTitle || "Book").slice(0, 100), ...(input.variantName ? { item_variant: String(input.variantName).slice(0, 100) } : {}) }] });
}

/** "Notify me when back in stock" signup shown on sold-out product pages. */
export default function BackInStockForm({
  design,
  bookId,
  bookTitle,
  variantId,
  variantName,
  comingSoon = false,
  id,
}: {
  /** Signup on a Coming soon book: "email me when it's out" wording (the server sends "Out now" on release). */
  comingSoon?: boolean;
  id?: string;
  design?: any;
  bookId: string;
  bookTitle: string;
  variantId?: string;
  variantName?: string;
}) {
  const [email, setEmail] = useState("");
  // "error" = the address doesn't look right; "failed" = the signup couldn't be saved (network, outage…).
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "failed">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAlertEmail(email)) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await saveStockAlert({ email, bookId, bookTitle, variantId, variantName });
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("failed");
    }
  };

  const body = (
    <>
      <p className="fm-pdp-alert-heading text-[11px] font-black tracking-[0.2em] uppercase">{getCopy(design, comingSoon ? "comingSoonAlertHeading" : "alertHeading")}</p>
      {status === "success" ? (
        <p role="status" className="mt-2 text-sm opacity-80">{getCopy(design, comingSoon ? "comingSoonAlertSuccess" : "alertSuccess")}</p>
      ) : (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row" noValidate>
          <input
            type="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder={getCopy(design, "alertPlaceholder")}
            aria-label={getCopy(design, "alertPlaceholder")}
            autoComplete="email"
            className="fm-pdp-alert-input min-w-0 flex-1 rounded-xl border border-white/[0.12] bg-transparent px-4 py-3 text-sm outline-none focus:border-white/40"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="fm-pdp-alert-btn rounded-xl border border-white/30 px-5 py-3 text-[11px] font-black tracking-[0.2em] uppercase transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            {getCopy(design, status === "loading" ? "alertSending" : "alertButton")}
          </button>
        </form>
      )}
      {(status === "error" || status === "failed") && (
        <p role="alert" className="mt-2 text-xs opacity-80">{getCopy(design, status === "failed" ? "alertSaveError" : "alertError")}</p>
      )}
    </>
  );
  // Two wrappers (same look) so each signup keeps its own name in Studio's click-to-edit. Their look is
  // Style › Product page · buy card & details › "Notify me" signup box (`pdpAlert*`, productPageStyle.ts).
  return comingSoon ? (
    <div id={id} className="fm-pdp-alert mt-4 rounded-2xl border border-white/[0.08] p-4" data-studio-target="style:productPage|style:productCard|copy:Product page" data-studio-label="Coming soon signup">{body}</div>
  ) : (
    <div id={id} className="fm-pdp-alert mt-4 rounded-2xl border border-white/[0.08] p-4" data-studio-target="style:productPage|style:productCard|copy:Product page" data-studio-label="Back-in-stock signup">{body}</div>
  );
}
