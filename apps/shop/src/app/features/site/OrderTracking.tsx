import { orderChargedTotal } from "./orderMoney";
import { digitalEntries, downloadBookIds, UNREADABLE_BOOK, type DigitalEntry } from "./digitalLine";
import { publicApi } from "../../lib/publicApi";
import { orderLineNotes } from "./orderLineNotes";
import { orderAccessHeaders, rememberOrderAccess, savedOrderAccess } from "../../lib/orderAccessClient";
import { useSEO } from "../../lib/seo";
import { regionProps } from "./storefrontRegions";
import { normalizeOrderNumber } from "./orderNumber";
import { getTrackingUrl } from "../../lib/tracking";
import { useState, useEffect } from "react";
import { Link } from "react-router";
import { ArrowLeft, Package, Truck, CheckCircle2, MapPin, Loader2, Download, ExternalLink } from "lucide-react";
import { TRACKING_CSS } from "./trackingStyle";
import { m, AnimatePresence } from "motion/react";
import { functionUrl, functionFetch } from "../../lib/functionsBase";
import { newsletterLinkAction } from "./newsletterSignup";
import { useCurrency } from "../../CurrencyContext";
import { useSiteData } from "./useSiteData";
import { StoreChrome, useInStoreChrome } from "./StoreChrome";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { getCopy, CopyError, copyErrorText } from "./storeCopy";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { orderStage, orderStep, shippingDays, stepDates } from "./orderStatus";
import { OrderRequestBox, PrivacyRequestBox } from "./OrderRequests";
import { waitingPreorderLines, shipDateOf, formatReleaseDate, linePreorderNote } from "./preorder";

/** Order tracking, inside the one shop header and footer (Studio 2.0 · 2.1). */
export default function OrderTracking() {
  return <StoreChrome surface="trackingPage"><OrderTrackingContent /></StoreChrome>;
}

function OrderTrackingContent() {
  // Under the shop header the order slip's heading is a plain block, not a second <header>.
  const SlipHeader = useInStoreChrome() ? "div" : "header";
  const [orderIdInput, setOrderIdInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [digitalItems, setDigitalItems] = useState<DigitalEntry[]>([]);
  const [downloadNotice, setDownloadNotice] = useState("");
  // How the shopper proved the order is theirs (email typed, or the emailed link key); requests reuse it.
  const [access, setAccess] = useState<{ email?: string; key?: string }>({});
  
  const { formatPrice } = useCurrency();
  const { settings, books } = useSiteData();
  useSEO({ title: getCopy(settings?.design, "trackTitle"), description: getCopy(settings?.design, "trackSubtitle"), noindex: true });

  // If order is already found, check if items have digital formats
  useEffect(() => {
    // A new lookup (or "Look up another order") never shows the previous order's downloads.
    setDigitalItems([]);
    setDownloadNotice("");
    if (!order) return;
    let cancelled = false;
    // ⚡ Bolt: Eliminate sequential DB reads by fetching all items in the order concurrently.
    async function checkDigitalAssets() {
      const booksById: Record<string, any> = {};
      await Promise.all(
        downloadBookIds(order).map(async (id) => {
          try {
            booksById[id] = (await publicApi.getBook(id).catch(() => null)) || UNREADABLE_BOOK;
          } catch (err) {
            console.warn("Could not retrieve book metadata for digital check", err);
          }
        })
      );
      // One download per book and edition; box-set parts included (the server checks the same).
      if (!cancelled) setDigitalItems(digitalEntries(order, booksById));
    }
    checkDigitalAssets();
    return () => { cancelled = true; };
  }, [order]);

  // The "Unsubscribe" link in reminder and newsletter emails lands here: ?unsubscribe=1&e=…&t=…
  // The newsletter confirmation link does too: ?newsletter_confirm=1&e=…&t=…
  const [unsubscribe, setUnsubscribe] = useState<"" | "working" | "done" | "failed">("");
  const [newsConfirm, setNewsConfirm] = useState<"" | "working" | "done" | "failed">("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const run = (action: "confirm" | "unsubscribe", set: (v: "working" | "done" | "failed") => void) => {
      set("working");
      newsletterLinkAction(action, params.get("e") || "", params.get("t") || "")
        .then(ok => set(ok ? "done" : "failed"))
        .catch(() => set("failed"));
    };
    if (params.get("unsubscribe") === "1") run("unsubscribe", setUnsubscribe);
    if (params.get("newsletter_confirm") === "1") run("confirm", setNewsConfirm);
  }, []);

  // Email links carry ?orderId=…&key=…: a matching key opens the order straight away;
  // otherwise the order number is filled in and the customer confirms their email.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedId = (params.get("orderId") || "").trim();
    const key = (params.get("key") || savedOrderAccess(linkedId) || "").trim();
    if (key) {
      rememberOrderAccess(linkedId, key);
      window.history.replaceState(null, "", `${window.location.pathname}?orderId=${encodeURIComponent(linkedId)}`);
    }
    if (!linkedId) return;
    setOrderIdInput(linkedId);
    if (!key) return;
    let cancelled = false;
    setLoading(true);
    publicApi.getPublicOrder(linkedId, { key })
      // A wrong or expired key says so instead of leaving a silent, empty form.
      .then((found: any) => {
        if (cancelled) return;
        if (found) { setOrder(found); setAccess({ key }); }
        else setError(getCopy(settings?.design, "trackError"));
      })
      .catch(() => { if (!cancelled) setError(getCopy(settings?.design, "trackError")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Order numbers are shown in capitals; accept them typed in any case.
  const findOrder = async (input: string, email: string) => {
    const typed = normalizeOrderNumber(input);
    if (!typed) return null;
    const exact = await publicApi.getPublicOrder(typed, { email });
    if (exact || typed === typed.toUpperCase()) return exact;
    return publicApi.getPublicOrder(typed.toUpperCase(), { email });
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderIdInput.trim() || !emailInput.trim()) {
      setError(getCopy(settings?.design, "trackErrFill"));
      return;
    }

    setLoading(true);
    setError("");
    setOrder(null);

    setLinkSent(false);
    try {
      let foundOrder: any = null;
      try { foundOrder = await findOrder(orderIdInput, emailInput.trim()); } catch (err: any) {
        if (!["email_mismatch"].includes(err?.code)) throw err;
      }
      if (foundOrder) {
        setOrder(foundOrder);
        setAccess({ key: savedOrderAccess(foundOrder.id) });
      } else {
        const response = await functionFetch("createStripeCheckoutSession", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "trackingLink", orderId: normalizeOrderNumber(orderIdInput), email: emailInput.trim() }),
        });
        if (!response.ok) throw Object.assign(new Error("tracking_link_failed"), { code: response.status === 429 ? "too_many" : "failed" });
        setLinkSent(true);
      }
    } catch (err: any) {
      setError(copyErrorText(err, settings?.design, err?.code === "too_many" ? "trackErrTooMany" : "trackError"));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (itemId: string, variantId = "") => {
    if (!order) return;
    if (!order.downloadToken) { setDownloadNotice(getCopy(settings?.design, "trackDownloadError")); return; }
    setDownloadNotice("");
    // The download endpoint authorizes via the secret token issued at
    // payment time, not the (guessable) customer email.
    window.open(
      `${functionUrl("downloadDigitalAsset")}?orderId=${encodeURIComponent(order.id || order.orderId)}&itemId=${encodeURIComponent(itemId)}${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ""}&token=${encodeURIComponent(order.downloadToken)}`,
      "_blank"
    );
  };

  // A card payment Stripe has confirmed must never sit on "unpaid" because a webhook
  // was missed or is slow: ask the server to check with Stripe (it verifies the
  // payment itself and finishes the order), then show the fresh order.
  const [rechecking, setRechecking] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [recheckDone, setRecheckDone] = useState(false);
  const [recheckError, setRecheckError] = useState("");
  const orderKey = order ? (order.id || order.orderId) : "";
  const ended = ["refunded", "cancelled"].includes(String(order?.paymentStatus || "").toLowerCase()) || ["refunded", "cancelled"].includes(String(order?.status || "").toLowerCase());
  const canRecheck = Boolean(order && order.paymentStatus !== "paid" && order.paymentStatus !== "pending" && !ended
    && /stripe/i.test(String(order.paymentMethod || "")));
  const recheckPayment = async () => {
    if (!orderKey || rechecking) return;
    setRechecking(true);
    setRecheckError("");
    try {
      const response = await functionFetch("createStripeCheckoutSession", {
        method: "POST",
        headers: await orderAccessHeaders(orderKey, access.key),
        body: JSON.stringify({ action: "status", orderId: orderKey }),
      });
      if (!response.ok) throw new CopyError(settings?.design, "trackError");
      const result = await response.json();
      setAwaitingWebhook(result.awaitingWebhook === true);
      const fresh: any = await publicApi.getPublicOrder(orderKey, access);
      if (fresh) setOrder(fresh);
    } catch (err) {
      setRecheckError(copyErrorText(err, settings?.design, "trackError"));
    } finally {
      setRechecking(false);
      setRecheckDone(true);
    }
  };
  useEffect(() => {
    setAwaitingWebhook(false);
    setRecheckDone(false);
    setRecheckError("");
    if (canRecheck) recheckPayment();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const fulfillment = order?.fulfillment;
  const fulfillmentStatus = String(order?.fulfillmentStatus || order?.status || "").toLowerCase();
  const isPickup = fulfillment?.method === "pickup";
  const isLocalDelivery = fulfillment?.method === "local_delivery";
  const currentStep = orderStep(order);
  const stage = orderStage(order);
  const dates = stepDates(order);
  const days = shippingDays(order);
  const shipAddress = order?.customer?.address || {};

  const shippingSteps = [
    { label: getCopy(settings?.design, "trackStepPaid"), desc: getCopy(settings?.design, "trackStepPaidDesc"), icon: CheckCircle2 },
    { label: getCopy(settings?.design, "trackStepProcessing"), desc: getCopy(settings?.design, "trackStepProcessingDesc"), icon: Package },
    { label: getCopy(settings?.design, fulfillmentStatus === "out_for_delivery" ? "trackOutForDelivery" : "trackStepShipped"), desc: getCopy(settings?.design, "trackStepShippedDesc"), icon: Truck },
    { label: getCopy(settings?.design, "trackStepDelivered"), desc: getCopy(settings?.design, "trackStepDeliveredDesc"), icon: MapPin },
  ];
  const localSteps = isPickup ? [
    shippingSteps[0],
    shippingSteps[1],
    { label: getCopy(settings?.design, "trackPickupReady"), desc: fulfillment?.estimate || getCopy(settings?.design, "trackStepProcessingDesc"), icon: MapPin },
    { label: getCopy(settings?.design, "trackCollected"), desc: getCopy(settings?.design, "trackStepDeliveredDesc"), icon: CheckCircle2 },
  ] : [
    shippingSteps[0],
    { label: getCopy(settings?.design, "trackReadyForDelivery"), desc: fulfillment?.estimate || getCopy(settings?.design, "trackStepProcessingDesc"), icon: Package },
    { label: getCopy(settings?.design, "trackOutForDelivery"), desc: getCopy(settings?.design, "trackStepShippedDesc"), icon: Truck },
    shippingSteps[3],
  ];
  const steps = isPickup || isLocalDelivery ? localSteps : shippingSteps;

  // Format order prices using checkout currency if available, else fallback
  const orderFormatPrice = (priceInCAD: number) => {
    if (order?.checkoutCurrency && order?.exchangeRate) {
      const symbols: Record<string, string> = { CAD: "CA$ ", USD: "$ ", EUR: "€ " };
      const symbol = symbols[order.checkoutCurrency] || "$ ";
      const converted = priceInCAD * order.exchangeRate;
      return `${symbol}${converted.toFixed(2)}`;
    }
    return formatPrice(priceInCAD);
  };

  const stampState = stage === "refunded" || stage === "cancelled" ? "ended" : order?.paymentStatus === "paid" ? "paid" : "unpaid";
  const pad2 = (n: number) => String(n).padStart(2, "0");

  return (
    <div data-fm-store data-studio-target="copy:Order tracking|style:colors" data-studio-label="Order tracking page" className="fm-track min-h-screen fm-page text-white font-sans relative pb-24">
      <StorefrontThemeStyle design={settings?.design} />
      <style>{TRACKING_CSS}</style>
      {/* Riso registration strip (Studio region "trackingGlow"). */}
      <div {...regionProps("trackingGlow")} aria-hidden="true" className="fm-track-strip" />

      {/* Header strip */}
      <nav {...regionProps("trackingHeader")} className="relative z-10 border-b-2 fm-track-rule">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="fm-track-link fm-track-mono">
            <ArrowLeft size={14} aria-hidden="true" /> {getCopy(settings?.design, "trackBack")}
          </Link>
          <span className="fm-track-mono">{getCopy(settings?.design, "trackEyebrow")}</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 relative z-10">
        <AnimatePresence mode="wait">
          {!order ? (
            /* Look-up form */
            <m.div {...regionProps("trackingForm")} key="search-form"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="max-w-xl mx-auto">
              <div {...regionProps("trackingIntro")} className="mb-8">
                <p className="fm-track-mono mb-3">{getCopy(settings?.design, "trackEyebrow")}</p>
                <h1 className="fm-track-display text-5xl sm:text-6xl">{getCopy(settings?.design, "trackTitle")}</h1>
                <p className="mt-4 text-base leading-7 fm-muted">{getCopy(settings?.design, "trackSubtitle")}</p>
              </div>
              {unsubscribe && (
                <div className="fm-track-notice mb-6" data-tone={unsubscribe === "failed" ? "danger" : undefined} role="status"
                  data-studio-target="copy:Order tracking" data-studio-label="Unsubscribe message">
                  <p>{getCopy(settings?.design, unsubscribe === "working" ? "trackUnsubWorking" : unsubscribe === "done" ? "trackUnsubDone" : "trackUnsubFailed")}</p>
                </div>
              )}
              {newsConfirm && (
                <div className="fm-track-notice mb-6" data-tone={newsConfirm === "failed" ? "danger" : undefined} role="status"
                  data-studio-target="copy:Order tracking" data-studio-label="Newsletter confirmation message">
                  <p>{getCopy(settings?.design, newsConfirm === "working" ? "trackNewsConfirmWorking" : newsConfirm === "done" ? "trackNewsConfirmDone" : "trackNewsConfirmFailed")}</p>
                </div>
              )}
              <form onSubmit={handleTrack} className="fm-track-card p-6 sm:p-8 space-y-5">
                <label className="block space-y-2">
                  <span className="fm-track-mono block">{getCopy(settings?.design, "trackOrderLabel")}</span>
                  <input type="text" required placeholder={getCopy(settings?.design, "trackOrderPlaceholder")} value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)} className="fm-track-input font-mono uppercase" />
                </label>
                <label className="block space-y-2">
                  <span className="fm-track-mono block">{getCopy(settings?.design, "trackEmailLabel")}</span>
                  <input type="email" required placeholder={getCopy(settings?.design, "trackEmailPlaceholder")} value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)} className="fm-track-input" />
                </label>
                {linkSent && <p role="status" className="text-sm leading-6">{getCopy(settings?.design, "trackLinkSent")}</p>}
                {error && (
                  <div className="fm-track-notice" data-tone="danger" role="alert"><p><strong aria-hidden="true">✕ </strong>{error}</p></div>
                )}
                <button type="submit" disabled={loading} className="fm-track-btn w-full">
                  {loading ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {getCopy(settings?.design, "trackLoading")}</> : getCopy(settings?.design, "trackSubmit")}
                </button>
              </form>
            </m.div>
          ) : (
            /* The order slip */
            <m.div key="order-display" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              <button type="button" onClick={() => setOrder(null)} className="fm-track-link fm-track-mono bg-transparent border-0 p-0 cursor-pointer">
                <ArrowLeft size={14} aria-hidden="true" /> {getCopy(settings?.design, "trackAnother")}
              </button>

              <SlipHeader {...regionProps("trackingSummary")} className="fm-track-card p-6 sm:p-10">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                  <div className="min-w-0">
                    <p className="fm-track-mono mb-3">{getCopy(settings?.design, "trackFound")}</p>
                    <h1 className="fm-track-display text-4xl sm:text-6xl break-words">{getCopy(settings?.design, "coOrderNumber", { number: order.orderId })}</h1>
                    <p className="fm-track-mono mt-4">{getCopy(settings?.design, "trackCreated")} {order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : ""}</p>
                  </div>
                  <div className="flex md:flex-col items-end justify-between md:justify-end gap-3 border-t-2 md:border-t-0 fm-track-rule pt-6 md:pt-0">
                    <div className="text-left md:text-right">
                      <p className="fm-track-mono">{getCopy(settings?.design, "trackTotalPayable")}</p>
                      <p className="fm-track-display text-4xl sm:text-5xl mt-1">{orderChargedTotal(order, formatPrice)}</p>
                    </div>
                    <span className="fm-track-stamp" data-state={stampState}>
                      <span aria-hidden="true">{stampState === "paid" ? "✓" : stampState === "ended" ? "✕" : "○"}</span>
                      {getCopy(settings?.design, stage === "refunded" ? "accountRefunded" : stage === "cancelled" ? "accountCancelled" : order.paymentStatus === "paid" ? "trackPaid" : "trackUnpaid")}
                    </span>
                  </div>
                </div>
              </SlipHeader>

              {stage !== "active" && (
                <div {...regionProps("trackingStatusBanner")} role="status" className="fm-track-notice" data-tone={stage === "awaiting_payment" ? "warning" : "danger"}>
                  <p>
                    <strong aria-hidden="true">{stage === "awaiting_payment" ? "! " : "✕ "}</strong>
                    {recheckError || (rechecking ? getCopy(settings?.design, "trackRechecking") : getCopy(settings?.design, stage === "awaiting_payment" ? (awaitingWebhook ? "trackAwaitingWebhook" : recheckDone && canRecheck ? "trackStillUnpaid" : "trackAwaitingPayment") : stage === "cancelled" ? "trackCancelledBanner" : "trackRefundedBanner"))}
                  </p>
                  {canRecheck && (
                    <button type="button" onClick={recheckPayment} disabled={rechecking} className="fm-track-btn fm-track-btn-ghost">
                      {rechecking && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {getCopy(settings?.design, "trackRecheck")}
                    </button>
                  )}
                </div>
              )}

              {stage === "active" && order.paymentStatus === "paid" && !["shipped", "out_for_delivery", "delivered", "collected", "ready_for_pickup", "ready_for_delivery"].includes(order.fulfillmentStatus) && waitingPreorderLines(order).length > 0 && (
                <p {...regionProps("trackingPreorder")} role="note" className="fm-track-notice" data-tone="info">
                  {shipDateOf(waitingPreorderLines(order))
                    ? getCopy(settings?.design, "trackPreorder", { date: formatReleaseDate(shipDateOf(waitingPreorderLines(order))) })
                    : getCopy(settings?.design, "trackPreorderTba")}
                </p>
              )}

              {stage === "active" && (
                <section {...regionProps("trackingTimeline")} aria-label={getCopy(settings?.design, "trackTimeline")}>
                  <p className="fm-track-mono mb-4">{getCopy(settings?.design, "trackTimeline")}</p>
                  <ol className="fm-track-steps list-none p-0 m-0">
                    {steps.map((step, index) => {
                      const done = index <= currentStep;
                      const StepIcon = step.icon;
                      return (
                        <li key={index} className="fm-track-step" data-done={String(done)} data-current={String(index === currentStep)} aria-current={index === currentStep ? "step" : undefined}>
                          <div className="fm-track-dot">{done ? <StepIcon size={16} aria-hidden="true" /> : pad2(index + 1)}</div>
                          <p className="text-sm font-bold uppercase tracking-wide">{step.label}</p>
                          <p className="text-xs mt-1 fm-muted leading-5">{step.desc}</p>
                          {done && dates[index] && <p className="fm-track-mono mt-2">{new Date(dates[index] as string).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}

              {!isPickup && !isLocalDelivery && order.shippingMethod && stage === "active" && (
                <section {...regionProps("trackingShipping")} className="border-t-2 fm-track-rule pt-6">
                  <p className="fm-track-mono mb-4">{getCopy(settings?.design, "trackShippingHeading")}</p>
                  <dl className="grid gap-6 sm:grid-cols-3 text-sm m-0">
                    <div><dt className="fm-track-mono">{getCopy(settings?.design, "trackShippingMethod")}</dt><dd className="mt-2 m-0">{order.shippingMethod}</dd></div>
                    {(days || order.shippingEstimate?.terms) && (
                      <div><dt className="fm-track-mono">{getCopy(settings?.design, "trackExpected")}</dt><dd className="mt-2 m-0">{days ? getCopy(settings?.design, "trackExpectedDays", { days }) : order.shippingEstimate.terms}</dd></div>
                    )}
                    {shipAddress.street && (
                      <div><dt className="fm-track-mono">{getCopy(settings?.design, "trackShipTo")}</dt><dd className="mt-2 m-0 fm-muted">{[shipAddress.street, shipAddress.city, shipAddress.state, shipAddress.zip, shipAddress.country].filter(Boolean).join(", ")}</dd></div>
                    )}
                  </dl>
                </section>
              )}

              {(isPickup || isLocalDelivery) && fulfillment && (
                <section {...regionProps("trackingFulfillment")} className="fm-track-card p-6 sm:p-8 space-y-3">
                  <p className="fm-track-mono">{getCopy(settings?.design, "trackFulfillment")}</p>
                  <p className="fm-track-display text-2xl">{isPickup ? getCopy(settings?.design, "trackPickup") : getCopy(settings?.design, "trackLocalDelivery")} · {fulfillment.name}</p>
                  {(isPickup ? fulfillment.address : fulfillment.destination) && <address className="not-italic text-sm leading-6 fm-muted">
                    {(() => { const a = isPickup ? fulfillment.address : fulfillment.destination; return [a.street, a.unit, a.city, a.state, a.zip, a.country].filter(Boolean).join(", "); })()}
                  </address>}
                  {fulfillment.hours && <p className="text-sm fm-muted">{getCopy(settings?.design, "trackFulfillmentHours")}: {fulfillment.hours}</p>}
                  {fulfillment.estimate && <p className="text-sm fm-muted">{getCopy(settings?.design, "trackFulfillmentEstimate")}: {fulfillment.estimate}</p>}
                  {fulfillment.instructions && <p className="whitespace-pre-wrap text-sm leading-6 fm-muted">{getCopy(settings?.design, "trackFulfillmentInstructions")}: {fulfillment.instructions}</p>}
                </section>
              )}

              {order.trackingNumber && (() => {
                const carrierTrackingUrl = getTrackingUrl(order.trackingCarrier || "", order.trackingNumber, order.trackingUrl);
                return (
                  <section {...regionProps("trackingShipment")} className="fm-track-card p-6 sm:p-8 flex flex-col md:flex-row justify-between md:items-center gap-6">
                    <div>
                      <p className="fm-track-mono">{getCopy(settings?.design, "trackLogisticsEyebrow")}</p>
                      <p className="fm-track-display text-2xl mt-2">{getCopy(settings?.design, "trackCarrier")}</p>
                      <p className="text-sm fm-muted mt-2">{getCopy(settings?.design, "trackInTransit")} <code className="font-mono">{order.trackingNumber}</code>{order.trackingCarrier ? ` (${order.trackingCarrier.toUpperCase()})` : ""}</p>
                    </div>
                    <a href={carrierTrackingUrl} target="_blank" rel="noopener noreferrer" className="fm-track-btn shrink-0">
                      {getCopy(settings?.design, "trackShipment")} <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  </section>
                );
              })()}

              {digitalItems.length > 0 && order.paymentStatus === "paid" && (
                <section {...regionProps("trackingDownloads")} className="fm-track-card p-6 sm:p-8 space-y-5">
                  <div>
                    <p className="fm-track-display text-2xl">{getCopy(settings?.design, "trackDigitalTitle")}</p>
                    <p className="text-sm fm-muted mt-2">{getCopy(settings?.design, "trackDigitalText")}</p>
                  </div>
                  <ul className="list-none p-0 m-0">
                    {digitalItems.map((item) => {
                      return (
                        <li key={`${item.itemId}|${item.variantId}`} className="flex items-center justify-between gap-4 py-3 border-b fm-track-rule">
                          <div className="min-w-0">
                            <p className="text-sm font-bold uppercase truncate">{item.title}</p>
                            <p className="fm-track-mono mt-1">{getCopy(settings?.design, "trackDigitalFormat")}</p>
                          </div>
                          <button type="button" onClick={() => handleDownload(item.itemId, item.variantId)} className="fm-track-btn" aria-label={getCopy(settings?.design, "trackDownload")} title={getCopy(settings?.design, "trackDownload")}>
                            <Download size={16} aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {downloadNotice && <div className="fm-track-notice" data-tone="danger" role="alert"><p>{downloadNotice}</p></div>}
                </section>
              )}

              <section {...regionProps("trackingItems")} className="fm-track-card p-6 sm:p-10">
                <p className="fm-track-mono mb-6">{getCopy(settings?.design, "trackItems")}</p>
                <ol className="list-none p-0 m-0 space-y-5">
                  {(order.items || []).map((item: any, idx: number) => (
                    <li key={idx} className="flex gap-4 sm:gap-6 items-center">
                      <span className="fm-track-mono w-6 shrink-0">{pad2(idx + 1)}</span>
                      <div className="fm-track-thumb">
                        {item.photoUrl && <img loading="lazy" decoding="async" src={item.photoUrl} alt={item.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-base font-bold uppercase tracking-wide truncate">{item.title}</p>
                        {item.variantName && <p className="fm-track-mono mt-1">{item.variantName}</p>}
                        {orderLineNotes(item, (k, v) => getCopy(settings?.design, k, v), "track").length > 0 && (
                          <ul {...regionProps("trackingLineDetails")} className="list-none p-0 m-0 mt-1">
                            {orderLineNotes(item, (k, v) => getCopy(settings?.design, k, v), "track").map((note, n) => <li key={n} className="fm-track-mono">{note}</li>)}
                          </ul>
                        )}
                        {order.paymentStatus === "paid" && !["shipped", "out_for_delivery", "delivered", "collected"].includes(order.fulfillmentStatus) && linePreorderNote(item, (k, v) => getCopy(settings?.design, k, v)) && <p className="fm-track-mono mt-1">{linePreorderNote(item, (k, v) => getCopy(settings?.design, k, v))}</p>}
                        <p className="fm-track-mono mt-2">{getCopy(settings?.design, "qtyLine", { qty: item.quantity })} × {orderFormatPrice(item.price)}</p>
                      </div>
                      <span className="font-mono text-sm sm:text-base font-bold shrink-0">{orderFormatPrice(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ol>
                <div className="fm-track-ledger mt-8">
                  <div className="fm-track-row"><span className="fm-track-mono">{getCopy(settings?.design, "summarySubtotal")}</span><span className="font-mono">{orderFormatPrice(order.subtotal)}</span></div>
                  {order.discount > 0 && <div className="fm-track-row fm-success-text"><span className="fm-track-mono">{getCopy(settings?.design, "summaryDiscount")}</span><span className="font-mono">−{orderFormatPrice(order.discount)}</span></div>}
                  <div className="fm-track-row"><span className="fm-track-mono">{getCopy(settings?.design, "summaryShipping")}</span><span className="font-mono">{order.shipping > 0 ? orderFormatPrice(order.shipping) : getCopy(settings?.design, "coFree")}</span></div>
                  {order.tax > 0 && <div className="fm-track-row"><span className="fm-track-mono">{getCopy(settings?.design, "summaryTax")}</span><span className="font-mono">{orderFormatPrice(order.tax)}</span></div>}
                  <div className="fm-track-total"><span className="fm-track-mono">{getCopy(settings?.design, "summaryTotal")}</span><span className="fm-track-display text-3xl sm:text-4xl">{orderChargedTotal(order, formatPrice)}</span></div>
                </div>
              </section>

              <OrderRequestBox design={settings?.design} order={order} access={access} onUpdated={setOrder} />

              <p {...regionProps("trackingHelp")} className="text-center text-sm leading-6 fm-muted">{getCopy(settings?.design, "trackHelp")}</p>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* On/off is Theme settings › Customer accounts (showPrivacyRequestForm); the region is `required` so it has no second switch. */}
      {!order && settings?.design?.showPrivacyRequestForm === true && <div className="px-5 sm:px-8 relative z-10"><PrivacyRequestBox design={settings?.design} /></div>}

      <TemplateSections design={settings?.design} templateId="trackingPage" books={books} />
      <GlobalSections design={settings?.design} books={books} />
    </div>
  );
}
