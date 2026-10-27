import { plainError } from "./plainError";
import { ReturnWorkbench } from "./ReturnWorkbench";
import { acquisitionRows } from "./orderAcquisition";
import { DOWNLOAD_LIMIT } from "../features/site/digitalLine";
import { FulfillmentWorkbench } from "./FulfillmentWorkbench";
import { LabelBuyer, type Parcel, type ParcelPreset } from "./LabelBuyer";
import { CARRIERS, cleanTrackingLink, getTrackingUrl } from "../lib/tracking";
import {
  addressKey,
  packingKey,
  queueOf,
  dispatchProblem,
  defaultRestockOnRefund,
  booksLeftOutAfterRefund,
  matchesCustomerService,
  suggestedParcelWeightGrams,
  canMarkManualPaid,
  lockedAddressFields,
  packingTicksKey,
  isDigitalItem,
  disputeOpen,
  terminal,
} from "./fulfillment";
import { printOrders, type SlipShop } from "./orderPrint";
import { getCopy } from "../features/site/storeCopy";
import { discountLabel, giftCardConflictOpen, giftCardPaid, issuedGiftCards, chargedOf, refundedMinor, refundableMinor, formatMinor, parseMoneyToMinor, customerMailto, telHref } from "./orderLines";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { adminApi } from "./api";
import { usePhone } from "./usePhone";
import { inventoryOrderUrl, orderInInventoryApp, useInventoryLink } from "./appSwitch";
import { InventoryOrderLink } from "./AppSwitcher";
import toast from "react-hot-toast";
import {
  ActionMenu,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  DestructiveButton,
  SectionCard,
  SectionHead,
  SelectField,
  StatusBadge,
  Tabs,
  TextField,
  TextArea,
  type BadgeTone,
} from "./riso/components";

// "Placed Oct 16, 2026, 9:24 a.m." instead of the browser's numeric date (10/16/2026 could be read either way).
const placedAt = (value: any) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `Placed ${d.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}`;
};

export function OrderDetail({
  orderId,
  onClose,
  queueIds = [],
  onNavigate,
  onChanged,
}: {
  orderId: string;
  onClose: () => void;
  queueIds?: string[];
  onNavigate?: (id: string) => void;
  /** Called after an action (or a Stripe sync) changed the order — not on the first load — so a list beside it can refresh. */
  onChanged?: (order: any) => void;
}) {
  const inventoryLink = useInventoryLink();
  const queueIndex = queueIds.indexOf(orderId);
  const prevId = queueIndex > 0 ? queueIds[queueIndex - 1] : "";
  const nextId = queueIndex >= 0 && queueIndex < queueIds.length - 1 ? queueIds[queueIndex + 1] : "";
  // After finishing an order, move straight to the next one in the same queue.
  const goToNext = () => {
    if (!nextId || !onNavigate) return false;
    onNavigate(nextId);
    return true;
  };
  const [order, setOrder] = useState<any>(null);
  const phone = usePhone();
  // Tell the list beside us only when the order really changed (an action, a Stripe sync that
  // moved something) — never for the first load of an order, which made the desk reload every order.
  const lastSeen = useRef<{ id: string; stamp: string } | null>(null);
  useEffect(() => {
    if (!order) return;
    const stamp = JSON.stringify([order.updatedAt, order.paymentStatus, order.status, order.fulfillmentStatus, order.refundedAmountMinor, order.disputeStatus, order.returnProgress?.state]);
    const prev = lastSeen.current;
    lastSeen.current = { id: orderId, stamp };
    if (prev && prev.id === orderId && prev.stamp !== stamp) onChanged?.(order);
  }, [order]);
  // Catalog records for the order's books: current cover + shelf location on the packing checklist.
  const [books, setBooks] = useState<Record<string, any>>({});
  const bookIds = Array.from(new Set((order?.items || []).map((i: any) => i?.id).filter((id: any) => typeof id === "string" && id))).sort().join("|");
  useEffect(() => {
    if (!bookIds) return;
    let alive = true;
    Promise.all(bookIds.split("|").map((id) => adminApi.getBook(id).catch(() => null)))
      .then((list) => { if (alive) setBooks(Object.fromEntries(list.filter(Boolean).map((b: any) => [b.id, b]))); });
    return () => { alive = false; };
  }, [bookIds]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [note, setNote] = useState("");
  const [isGeneratingLabel, setIsGeneratingLabel] = useState(false);
  const [labelRates, setLabelRates] = useState<any[]>([]);
  const [labelShipmentId, setLabelShipmentId] = useState("");
  const [selectedLabelRate, setSelectedLabelRate] = useState("");
  // Rates were asked for the current parcel (cleared whenever the parcel changes, so a label is never bought for an old size).
  const [ratesSearched, setRatesSearched] = useState(false);
  const [showHold, setShowHold] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [isBuyingLabel, setIsBuyingLabel] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const voidingRef = useRef(false);
  const [restockOnRefund, setRestockOnRefund] = useState(false);
  const [refundReason, setRefundReason] = useState("Customer request");
  const [working, setWorking] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [holdReason, setHoldReason] = useState("");
  const [editAddress, setEditAddress] = useState<any>(null);
  const [parcel, setParcel] = useState({
    length: "10",
    width: "8",
    height: "2",
    weight: "680",
    distance_unit: "in",
    mass_unit: "g",
  });
  const parcelTouched = useRef(false);
  // Parcel presets live in settings/parcelPresets (shared by every browser). Presets saved in
  // this browser's localStorage before that are copied across once, then removed locally.
  const [presets, setPresets] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    let local: any[] = [];
    try { local = JSON.parse(localStorage.getItem("publisher-parcels") || "[]"); } catch { local = []; }
    if (!Array.isArray(local)) local = [];
    adminApi.getParcelPresets().then(async (remote) => {
      const merged = [...(remote || [])];
      for (const p of local) if (p?.name && !merged.some((m) => m.name === p.name)) merged.push(p);
      if (local.length && merged.length !== (remote || []).length) await adminApi.saveParcelPresets(merged);
      if (local.length) { try { localStorage.removeItem("publisher-parcels"); } catch { /* ignore */ } }
      if (alive) setPresets(merged);
    }).catch(() => { if (alive) setPresets(local); });
    return () => { alive = false; };
  }, []);
  const [emailLog, setEmailLog] = useState<any[] | null>(null);
  const [emailLogFailed, setEmailLogFailed] = useState(false);
  const orderIdRef = useRef(orderId);
  orderIdRef.current = orderId;
  const loadEmailLog = () => {
    setEmailLog(null);
    setEmailLogFailed(false);
    const forOrder = orderId;
    adminApi.getOrderEmailLog(forOrder)
      .then((rows) => { if (forOrder === orderIdRef.current) setEmailLog(rows); })
      .catch(() => { if (forOrder === orderIdRef.current) { setEmailLog([]); setEmailLogFailed(true); } });
  };
  useEffect(() => {
    loadEmailLog();
  }, [orderId]);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundOther, setRefundOther] = useState("");
  const [refundRestockLines, setRefundRestockLines] = useState<Record<number, number>>({});
  const [confirmAction, setConfirmAction] = useState<null | "markPaid" | "mismatch" | "giftConflict" | "requestHandled" | "resendConfirmation" | "resetDownloads" | "restockRefunded">(null);
  const [confirmReleasePreorder, setConfirmReleasePreorder] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<
    "all" | "event" | "note"
  >("all");
  const [confirming, setConfirming] = useState<null | "refund" | "cancel">(
    null,
  );

  useEffect(() => {
    // Packing ticks are restored per order from sessionStorage once the order loads.
    ticksLoaded.current = "";
    setLoading(true);
    loadOrder();
  }, [orderId]);

  // Any order paid (or being paid) through Stripe: ask Stripe (server-side) once per
  // visit for the truth — payment received, refunded or disputed — so a missed
  // webhook never leaves the order out of step with Stripe.
  const autoChecked = useRef<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const hasStripePayment = (o: any) =>
    !!o && ["unpaid", "paid"].includes(o.paymentStatus) && (String(o.stripePaymentIntentId || "").startsWith("pi_") || String(o.stripeCheckoutSessionId || "").startsWith("cs_"));

  async function checkStripePayment(manual: boolean) {
    setCheckingPayment(true);
    const before = order?.paymentStatus;
    try {
      const report = await adminApi.recheckStripePayment(orderId);
      const fresh = await adminApi.getOrderById(orderId);
      if (fresh) setOrder(fresh);
      if (fresh?.paymentStatus === "refunded" && before !== "refunded") toast.success("Stripe shows this payment was refunded — order updated and stock returned.");
      else if (fresh?.paymentStatus === "paid" && before === "unpaid") toast.success("Stripe confirmed the payment — order marked paid.");
      else if (fresh?.paymentMismatch && fresh?.paymentStatus !== "paid") toast.error("Stripe's amount doesn't match this order. Review it in Stripe before fulfilling.");
      else if (manual) toast((report as any).awaitingWebhook ? "Stripe received payment. The order is awaiting its verified webhook; review Webhook health before shipping." : fresh?.paymentStatus === "paid" ? "Order payment was confirmed by the webhook." : "Stripe has not confirmed this payment yet.");
    } catch (err: any) {
      if (manual) toast.error(plainError(err, "Couldn't reach Stripe"));
    } finally {
      setCheckingPayment(false);
    }
  }

  async function loadOrder() {
    setLoadFailed(false);
    try {
      const data = await adminApi.getOrderById(orderId);
      setOrder(data);
      if (hasStripePayment(data) && autoChecked.current !== orderId) {
        autoChecked.current = orderId;
        void checkStripePayment(false);
      }
      if (data) {
        fillTracking(data);
        // Start the label dialog from the books' catalog weights (grams), not a fixed guess.
        if (!parcelTouched.current) setParcel((p) => ({ ...p, weight: suggestedParcelWeightGrams(data), mass_unit: "g" }));
      }
    } catch (err) {
      console.error(err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  // "dispatch" = first hand-off to the carrier; "edit" = correct tracking on a parcel already in transit.
  const [showShipForm, setShowShipForm] = useState<false | "dispatch" | "edit">(false);
  const [trackingCarrier, setTrackingCarrier] = useState("Canada Post");
  const [otherCarrier, setOtherCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingLink, setTrackingLink] = useState("");
  const [isShipping, setIsShipping] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<null | "out_for_delivery" | "delivered">(null);
  const [confirmResend, setConfirmResend] = useState(false);
  // Pickup / local delivery hand-off waiting for confirmation (e.g. "mark the order ready for pickup").
  const [localStep, setLocalStep] = useState<string | null>(null);
  const [emailSettings, setEmailSettings] = useState<Record<string, any> | null>(null);
  // Settings that failed to load are unknown: never promise (or offer) an email we can't vouch for.
  const [emailSettingsFailed, setEmailSettingsFailed] = useState(false);
  useEffect(() => {
    adminApi.getNotificationSettings()
      .then((s) => { setEmailSettings(s); setEmailSettingsFailed(false); })
      .catch(() => { setEmailSettings(null); setEmailSettingsFailed(true); });
  }, []);
  const emailOn = (id: string) => !emailSettingsFailed && emailSettings?.[id]?.enabled !== false;
  const emailUnknownText = "Couldn't load your email settings, so it isn't known whether the customer will be emailed. Reload the page to check.";
  const carrierName = trackingCarrier === "Other" ? otherCarrier.trim() : trackingCarrier;

  function fillTracking(data: any) {
    const carrier = String(data?.trackingCarrier || "").trim();
    const known = !carrier || CARRIERS.includes(carrier);
    setTrackingCarrier(known ? carrier || "Canada Post" : "Other");
    setOtherCarrier(known ? "" : carrier);
    setTrackingNumber(data?.trackingNumber || "");
    setTrackingLink(data?.trackingUrl || "");
  }

  // Packing ticks survive a reload or a trip to another order (this browser tab only).
  const ticksKey = order ? packingTicksKey(order) : "";
  const ticksLoaded = useRef("");
  useEffect(() => {
    if (!ticksKey) return;
    let saved: number[] = [];
    try { saved = JSON.parse(sessionStorage.getItem(ticksKey) || "[]"); } catch { saved = []; }
    ticksLoaded.current = ticksKey;
    skipTickSave.current = true; // this render still holds the previous order's ticks
    setChecked(new Set(Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n)) : []));
  }, [ticksKey]);
  const skipTickSave = useRef(false);
  useEffect(() => {
    if (skipTickSave.current) { skipTickSave.current = false; return; }
    if (!ticksKey || ticksLoaded.current !== ticksKey) return;
    try {
      if (checked.size) sessionStorage.setItem(ticksKey, JSON.stringify([...checked]));
      else sessionStorage.removeItem(ticksKey);
    } catch { /* storage blocked: ticks just aren't remembered */ }
  }, [checked, ticksKey]);

  // "The label was voided or replaced": the owner types the real carrier and number instead of the label's.
  const [labelReplaced, setLabelReplaced] = useState(false);
  const rawLabel = !!(order?.labelUrl && order?.trackingNumber);
  const hasLabel = rawLabel && !labelReplaced;
  // Bought with a Shippo test key: not real postage, so it must never be dispatched (see the workbench notice).
  const testLabel = !!order?.labelUrl && order?.operations?.labelTest === true;
  const [showReplaceLabel, setShowReplaceLabel] = useState(false);

  // Fill the tracking link from the carrier and number while the dispatch dialog is open,
  // unless the owner typed their own link. Unknown carriers stay blank.
  const autoLink = useRef("");
  const autoCarrier = hasLabel ? order?.trackingCarrier || "" : carrierName;
  const autoNumber = hasLabel ? order?.trackingNumber || "" : trackingNumber;
  useEffect(() => {
    if (!showShipForm) return;
    const current = trackingLink.trim();
    if (current && current !== autoLink.current) return;
    const url = autoNumber.trim() && autoCarrier ? getTrackingUrl(autoCarrier, autoNumber) : "";
    const next = url.startsWith("https://www.google.com/") ? "" : url;
    autoLink.current = next;
    if (next !== current) setTrackingLink(next);
  }, [showShipForm, autoCarrier, autoNumber, trackingLink]);
  const [voidedElsewhere, setVoidedElsewhere] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceLabel = async () => {
    setReplacing(true);
    try {
      const result = await adminApi.voidLabel(orderId, voidedElsewhere);
      const finished = order ? terminal(order) : false;
      setShowReplaceLabel(false);
      setVoidedElsewhere(false);
      await loadOrder();
      const refundNote = result?.refundState === "refunded" ? "Shippo refunded it."
        : result?.refundState === "pending" ? "Shippo is checking it with the carrier (up to 14 business days); the order shows the result."
        : "It was removed from this order.";
      toast.success(`Label voided. ${refundNote}${finished ? "" : " Press Buy Shippo label to get a new one."}`);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't void the label.");
      await loadOrder();
    } finally {
      setReplacing(false);
    }
  };
  const markAsShipped = async () => {
    if (!hasLabel && (!trackingNumber.trim() || !carrierName)) {
      toast.error("Enter the carrier and tracking number.");
      return;
    }
    const editing = showShipForm === "edit";
    setIsShipping(true);
    try {
      // A Shippo label keeps its own carrier and number; only the link is the publisher's.
      await adminApi.fulfillmentAction(orderId, editing ? "edit_tracking" : "dispatch", {
        trackingCarrier: hasLabel ? order.trackingCarrier || "Canada Post" : carrierName,
        trackingNumber: hasLabel ? order.trackingNumber : trackingNumber,
        trackingUrl: trackingLink,
        ...(editing && rawLabel && labelReplaced ? { replaceLabel: true } : {}),
      });
      setShowShipForm(false);
      toast.success(
        editing
          ? "Tracking updated"
          : emailSettingsFailed
            ? "Marked shipped"
            : emailOn("shipping_confirmation")
            ? `Shipped — tracking emailed to ${order?.customer?.email || "the customer"}`
            : "Marked shipped (shipping email is switched off)",
      );
      if (editing || !goToNext()) loadOrder();
    } catch (err: any) {
      toast.error(err?.message || "Error updating order.");
    } finally {
      setIsShipping(false);
    }
  };

  const resendShippingEmail = async () => {
    setIsShipping(true);
    try {
      await adminApi.fulfillmentAction(orderId, "resend_shipping_email");
      setConfirmResend(false);
      loadOrder();
      toast.success("Shipping email sent again");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't resend the email.");
    } finally {
      setIsShipping(false);
    }
  };

  const updateDeliveryStatus = async () => {
    if (!deliveryStatus) return;
    setIsShipping(true);
    try {
      await adminApi.fulfillmentAction(orderId, "delivery_status", { status: deliveryStatus });
      setDeliveryStatus(null);
      loadOrder();
      toast.success(deliveryStatus === "delivered" ? "Marked delivered" : "Marked out for delivery");
    } catch (err: any) {
      toast.error(err?.message || "Error updating order.");
    } finally {
      setIsShipping(false);
    }
  };

  const handlePrintPackingSlip = async () => {
    // Shop name (Text & labels › Site & sharing) and return address (Settings › General › Location).
    let shop: SlipShop = {};
    try {
      const s: any = await adminApi.getPublicSettings();
      shop = { name: getCopy(s?.design || {}, "siteName"), location: s?.location };
    } catch { /* print without the shop block */ }
    printOrders([order], false, shop);
  };

  const handlePushToShippo = async () => {
    setIsGeneratingLabel(true);
    try {
      const result = await adminApi.getCanadaPostLabelRates(orderId, parcel);
      setLabelRates(result.rates || []);
      setLabelShipmentId(result.shipmentId || "");
      // Pre-select the service the customer paid for at checkout; never silently swap it.
      const chosen = (result.rates || []).find((r: any) => matchesCustomerService(r.name, order?.shippingMethod));
      setSelectedLabelRate(chosen?.id || (order?.shippingMethod ? "" : result.rates?.[0]?.id || ""));
      setRatesSearched(true);
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't load Canada Post rates"));
    } finally {
      setIsGeneratingLabel(false);
    }
  };

  const forgetRates = () => {
    setLabelRates([]);
    setLabelShipmentId("");
    setSelectedLabelRate("");
    setRatesSearched(false);
  };
  const changeParcel = (patch: Partial<Parcel>) => {
    parcelTouched.current = true;
    setParcel((prev) => ({ ...prev, ...patch }));
    forgetRates();
  };
  // A saved parcel sets the box size; the weight still comes from this order's books, in grams
  // (presets saved before weights went metric carry mass_unit "lb").
  const pickPreset = (preset: ParcelPreset) =>
    changeParcel({ ...preset.parcel, weight: String(suggestedParcelWeightGrams(order)), mass_unit: "g" } as Partial<Parcel>);
  const savePreset = async (name: string) => {
    const next = [...presets.filter((p) => p.name !== name), { name: name.slice(0, 60), parcel }].slice(-30);
    try {
      await adminApi.saveParcelPresets(next);
      setPresets(next);
      toast.success("Parcel saved");
      return true;
    } catch {
      toast.error("Could not save the parcel");
      return false;
    }
  };

  const handleBuyLabel = async () => {
    if (!selectedLabelRate || !labelShipmentId) return;
    setIsBuyingLabel(true);
    try {
      await adminApi.buyCanadaPostLabel(
        orderId,
        labelShipmentId,
        selectedLabelRate,
      );
      forgetRates();
      await loadOrder();
      toast.success("Label bought. Print it, then mark the parcel shipped when it leaves.");
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't purchase the label"));
      await loadOrder();
    } finally {
      setIsBuyingLabel(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim() || working) return;
    setWorking(true);
    try {
      await adminApi.addOrderNote(orderId, note);
      setNote("");
      await loadOrder();
      toast.success("Note added");
    } catch (err: any) {
      toast.error(plainError(err, "Could not save note"));
    } finally {
      setWorking(false);
    }
  };

  const handleRefund = async () => {
    if (voidingRef.current) return;
    voidingRef.current = true;
    setConfirming(null);
    setIsVoiding(true);
    try {
      const plan = refundAmountPlan();
      const reasonText = refundReason === "Other" && refundOther.trim() ? `Other: ${refundOther.trim()}` : refundReason;
      if (plan.partial) {
        const result = await adminApi.refundOrder(orderId, {
          reason: reasonText,
          restock: false,
          amountMinor: plan.minor,
          restockLines: Object.entries(refundRestockLines).filter(([, q]) => q > 0).map(([index, quantity]) => ({ index: Number(index), quantity })),
        });
        toast.success(result?.provider === "manual"
          ? `Partial refund of ${formatMinor(plan.minor, plan.currency)} recorded. Send the money back the way the customer paid.`
          : `${result?.provider === "paypal" ? "PayPal" : "Stripe"} partial refund of ${formatMinor(plan.minor, plan.currency)} ${result?.status === "pending" ? "started" : "made"}. The order stays paid.`);
        await loadOrder();
        return;
      }
      const result = await adminApi.refundOrder(orderId, {
        reason: reasonText,
        restock: restockOnRefund,
      });
      const pending = result?.status === "pending";
      const giftPaid = Number(order?.giftCardAmount) > 0;
      toast.success(
        result?.provider === "manual" && giftPaid && !(Number(order?.total) > 0)
          ? "Order refunded. The gift card balance was put back — nothing else to send."
          : result?.provider === "manual"
          ? (giftPaid ? "Order marked as refunded and the gift card balance was put back. Send back only the part the customer paid another way." : "Order marked as refunded. Send the money back the way the customer paid.")
          : `${result?.provider === "paypal" ? "PayPal" : "Stripe"} refund ${pending ? "started — the order updates when it completes" : "issued and order cancelled"}`,
      );
      loadOrder();
    } catch (err: any) {
      console.error(err);
      toast.error(plainError(err, "Failed to refund order"));
      // A refusal may have recorded something (e.g. a failed refund); don't leave stale actions offered.
      await loadOrder();
    } finally {
      voidingRef.current = false;
      setIsVoiding(false);
    }
  };

  // What the Refund dialog's amount box means: blank / everything left = full refund.
  function refundAmountPlan(): { partial: boolean; minor: number; currency: string; error: string } {
    const charged = order ? chargedOf(order) : { minor: 0, currency: "CAD" };
    const left = order ? refundableMinor(order) : 0;
    if (!refundAmount.trim()) return { partial: false, minor: left, currency: charged.currency, error: "" };
    const minor = parseMoneyToMinor(refundAmount);
    if (minor == null || minor <= 0) return { partial: false, minor: 0, currency: charged.currency, error: "Enter an amount like 12.50." };
    if (minor > left) return { partial: false, minor, currency: charged.currency, error: `At most ${formatMinor(left, charged.currency)} can be refunded.` };
    return { partial: minor < left, minor, currency: charged.currency, error: "" };
  }

  const runConfirmed = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action || working) return;
    setWorking(true);
    try {
      if (action === "markPaid") {
        await adminApi.markOrderPaid(orderId);
        toast.success("Payment recorded — the order is paid and ready to fulfil.");
      } else if (action === "mismatch") {
        await adminApi.resolvePaymentMismatch(orderId);
        toast.success("Marked as refunded");
      } else if (action === "giftConflict") {
        await adminApi.resolvePaymentMismatch(orderId);
        toast.success("Marked as resolved");
      } else if (action === "requestHandled") {
        await adminApi.updateOrder(orderId, { customerRequest: { ...order.customerRequest, status: "handled", handledAt: new Date().toISOString() } });
        toast.success("Request marked handled.");
      } else if (action === "restockRefunded") {
        const result = await adminApi.restockRefundedOrder(orderId);
        toast.success(`${result?.restocked || "The"} book${result?.restocked === 1 ? " is" : "s are"} back in stock`);
      } else if (action === "resetDownloads") {
        await adminApi.updateOrder(orderId, { downloadCounts: {} });
        toast.success("Download limits reset: the buyer can download each digital book again");
      } else {
        await adminApi.fulfillmentAction(orderId, "resend_confirmation_email");
        toast.success(`Order confirmation sent again to ${order?.customer?.email || "the customer"}`);
      }
      await loadOrder();
      adminApi.getOrderEmailLog(orderId).then((rows) => { setEmailLog(rows); setEmailLogFailed(false); }).catch(() => {});
    } catch (err: any) {
      // The server's own words (e.g. "Card and PayPal orders are marked paid only when…").
      toast.error(err?.message || "Couldn't update the order.");
    } finally {
      setWorking(false);
    }
  };

  const handleCancelUnpaid = async () => {
    if (voidingRef.current) return;
    voidingRef.current = true;
    setConfirming(null);
    setIsVoiding(true);
    try {
      // Server-side so an order paid a moment ago is refused, and the shopper's payment is stopped.
      await adminApi.cancelUnpaidOrder(orderId);
      await loadOrder();
      toast.success("Unpaid order cancelled");
    } catch (err: any) {
      toast.error(plainError(err, "Failed to cancel unpaid order"));
      // e.g. 409 paid_in_stripe records reconciliationPending: show it instead of the stale Cancel button.
      await loadOrder();
    } finally {
      voidingRef.current = false;
      setIsVoiding(false);
    }
  };

  const [confirmClearLabelLock, setConfirmClearLabelLock] = useState(false);
  const [confirmClearAppLabel, setConfirmClearAppLabel] = useState(false);
  const handleClearLabelLock = async () => {
    setConfirmClearLabelLock(false);
    if (working) return;
    setWorking(true);
    try {
      await adminApi.clearLabelPurchaseLock(orderId);
      toast.success("You can buy a new label now");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't allow a new label.");
    } finally {
      await loadOrder();
      setWorking(false);
    }
  };

  const perform = async (
    action: "review" | "pack" | "hold" | "release" | "release_preorder" | "local_transition" | "clear_app_label",
    payload: any = {},
  ) => {
    if (working) return;
    setWorking(true);
    try {
      await adminApi.fulfillmentAction(orderId, action, payload);
      await loadOrder();
      setShowHold(false);
      toast.success(
        action === "pack"
          ? "Books packed"
          : action === "review"
            ? "Address confirmed"
              : action === "hold"
                ? "Order held"
                : action === "release"
                  ? "Hold released"
                  : action === "release_preorder"
                    ? "Pre-order ready to pack"
                    : action === "clear_app_label"
                      ? "Inventory app label removed from the order"
                      : "Local fulfillment updated",
      );
    } catch (err: any) {
      toast.error(plainError(err, "Could not save fulfillment"));
    } finally {
      setWorking(false);
    }
  };
  const saveAddress = async () => {
    if (!editAddress || working) return;
    setWorking(true);
    try {
      await adminApi.correctOrderAddress(
        orderId,
        editAddress,
        addressKey(order),
      );
      setEditAddress(null);
      await loadOrder();
      toast.success("Address corrected. Review it before packing.");
    } catch (err: any) {
      toast.error(plainError(err, "Could not correct address"));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <LoadingState label="Retrieving order…" />;

  if (loadFailed && !order)
    return (
      <ErrorState
        description="This order could not be loaded. Check your connection and try again."
        onRetry={() => {
          setLoading(true);
          loadOrder();
        }}
      />
    );

  if (!order)
    return (
      <EmptyState
        title="Order not found"
        description="This order may have been deleted. Go back to the orders list and pick another."
        action={
          <SecondaryButton onClick={onClose}>Back to orders</SecondaryButton>
        }
      />
    );

  const paid = order.paymentStatus === "paid";
  const payTone: BadgeTone = paid
    ? "success"
    : order.paymentStatus === "refunded" ||
        order.paymentStatus === "refund_pending"
      ? "info"
      : "danger";
  const addr = order.customer?.address || {};
  const isManualPayment =
    order.paymentMethod &&
    order.paymentMethod !== "Stripe" &&
    order.paymentMethod !== "PayPal";
  const activity = [
    ...(order.activity || []),
    ...(order.operations?.activity || []),
  ]
    .sort(
      (a: any, b: any) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .filter((e: any) => timelineFilter === "all" || e.type === timelineFilter);
  const money = (n?: number) => `CA$${Number(n || 0).toFixed(2)}`;

  const queue = queueOf(order);
  const problem = dispatchProblem(order);
  // Only orders the link sent to the inventory app (the server's rule), with printed books in them.
  const showInInventory = !!inventoryLink && orderInInventoryApp(order, inventoryLink.startDay) && (order.items || []).some((item: any) => item && !isDigitalItem(item));

  return (
    <div className="rp-stack fw-detail">
      <div className="fw-toolbar" data-print="hide">
        <SecondaryButton
          size="sm"
          className="fw-back"
          icon={<ArrowLeft size={14} aria-hidden />}
          onClick={onClose}
        >
          {phone ? "Orders" : "Back to orders"}
        </SecondaryButton>
        {onNavigate && queueIndex >= 0 && queueIds.length > 1 && (
          <div className="fw-toolbar-nav" role="group" aria-label="Order navigation">
            <IconButton label="Previous order" disabled={!prevId} onClick={() => prevId && onNavigate(prevId)}>
              <ChevronLeft size={16} aria-hidden />
            </IconButton>
            <span className="rp-mono rp-hint">
              {queueIndex + 1} / {queueIds.length}
            </span>
            <IconButton label="Next order" disabled={!nextId} onClick={() => nextId && onNavigate(nextId)}>
              <ChevronRight size={16} aria-hidden />
            </IconButton>
          </div>
        )}
        <div className="fw-toolbar-actions">
          {showInInventory && !phone && <InventoryOrderLink orderId={order.id} />}
          {!phone && (
            <SecondaryButton size="sm" onClick={handlePrintPackingSlip}>
              Print packing slip
            </SecondaryButton>
          )}
          {(phone || (!isVoiding &&
            (paid ||
              (order.paymentStatus !== "refunded" &&
                order.paymentStatus !== "refund_pending" &&
                order.status !== "cancelled")))) && (
              <ActionMenu
                label="More order actions"
                actions={[
                  // Phones keep the toolbar to one row: the packing slip moves into this menu.
                  ...(phone ? [{ label: "Print packing slip", onSelect: handlePrintPackingSlip }] : []),
                  ...(phone && showInInventory ? [{ label: "See it in the inventory app", onSelect: () => { window.open(inventoryOrderUrl(order.id), "_blank", "noopener"); } }] : []),
                  ...(isVoiding ||
                  !(paid ||
                    (order.paymentStatus !== "refunded" &&
                      order.paymentStatus !== "refund_pending" &&
                      order.status !== "cancelled"))
                    ? []
                    : [
                  ...(canMarkManualPaid(order)
                    ? [{ label: "Payment received — mark paid", onSelect: () => setConfirmAction("markPaid") }]
                    : []),
                  ...(paid && !order.isTest
                    ? [{ label: "Resend order confirmation", onSelect: () => setConfirmAction("resendConfirmation") }]
                    : []),
                  // Each digital book can be downloaded a limited number of times; this gives the buyer a fresh allowance.
                  ...(paid && (order.items || []).some((item: any) => item && item.giftCard !== true && (item.bundle === true || isDigitalItem(item)))
                    ? [{ label: "Reset download limits", onSelect: () => setConfirmAction("resetDownloads") }]
                    : []),
                  ...(paid &&
                  [
                    "Needs attention",
                    "Ready to pack",
                    "Ready to ship",
                  ].includes(queue)
                    ? [
                        {
                          label: order.operations?.hold
                            ? "Release hold"
                            : "Place on hold",
                          onSelect: () =>
                            order.operations?.hold
                              ? perform("release")
                              : setShowHold(true),
                        },
                      ]
                    : []),
                  ...(paid
                    ? [
                        {
                          label: "Refund order",
                          tone: "danger" as const,
                          onSelect: () => {
                            // Default for this order: shipped/delivered books aren't back on the shelf.
                            setRestockOnRefund(defaultRestockOnRefund(order));
                            setRefundAmount("");
                            setRefundOther("");
                            setRefundRestockLines({});
                            setShowRefund(true);
                          },
                        },
                      ]
                    : order.paymentStatus !== "refunded" &&
                        order.paymentStatus !== "refund_pending" &&
                        order.status !== "cancelled"
                      ? [
                          {
                            label: "Cancel unpaid order",
                            tone: "danger" as const,
                            onSelect: () => setConfirming("cancel"),
                          },
                        ]
                      : []),
                  ]),
                ]}
              />
            )}
        </div>
      </div>
      <SectionHead
        title={order.orderId}
        subcopy={phone && order.customer?.name ? `${order.customer.name} · ${placedAt(order.createdAt)}` : placedAt(order.createdAt)}
        actions={
          <>
            <StatusBadge tone={payTone}>
              {paid
                ? "Paid"
                : String(order.paymentStatus || "unpaid").replace(/_/g, " ")}
            </StatusBadge>
            {order.isTest && (
              <StatusBadge tone="danger">Test order</StatusBadge>
            )}
          </>
        }
      />
      {loadFailed && (
        <ErrorState
          description="The latest order could not be loaded. Retry before continuing."
          onRetry={loadOrder}
        />
      )}
      <div className="fw-layout">
        <FulfillmentWorkbench
          order={order}
          books={books}
          checked={checked}
          busy={
            working || isShipping || isBuyingLabel || isVoiding || loadFailed
          }
          onCheck={(i) =>
            setChecked((prev) => {
              const next = new Set(prev);
              next.has(i) ? next.delete(i) : next.add(i);
              return next;
            })
          }
          onReview={() => perform("review", { addressKey: addressKey(order) })}
          onCorrect={() => setEditAddress({ ...addr })}
          onPack={() => perform("pack", { packingKey: packingKey(order) })}
          labelStep={
            <LabelBuyer
              order={order}
              parcel={parcel as Parcel}
              onParcel={changeParcel}
              presets={presets}
              onPreset={pickPreset}
              suggestedWeight={suggestedParcelWeightGrams(order)}
              rates={labelRates}
              searched={ratesSearched}
              selectedRate={selectedLabelRate}
              onSelectRate={setSelectedLabelRate}
              finding={isGeneratingLabel}
              buying={isBuyingLabel}
              busy={working || isShipping || isVoiding || loadFailed}
              problem={problem}
              onFindRates={handlePushToShippo}
              onBuy={handleBuyLabel}
              onDispatch={() => {
                fillTracking(order);
                setLabelReplaced(false);
                setShowShipForm("dispatch");
              }}
              onSavePreset={savePreset}
            />
          }
          onDispatch={() => {
            fillTracking(order);
            setLabelReplaced(false);
            setShowShipForm("dispatch");
          }}
          onEditTracking={() => {
            fillTracking(order);
            setLabelReplaced(false);
            setShowShipForm("edit");
          }}
          onReplaceLabel={() => { setVoidedElsewhere(false); setShowReplaceLabel(true); }}
          onDeliveryStatus={setDeliveryStatus}
          onResendEmail={() => setConfirmResend(true)}
          onCheckAll={(indices) => setChecked(new Set(indices))}
          onPackingSlip={handlePrintPackingSlip}
          onLocalAdvance={() => {
            const next = order.fulfillmentSelection?.method === "pickup"
              ? order.fulfillmentStatus === "ready_for_pickup" ? "record customer collection" : "mark the order ready for pickup"
              : order.fulfillmentStatus === "ready_for_delivery" ? "start local delivery" : order.fulfillmentStatus === "out_for_delivery" ? "mark the order delivered" : "mark the order ready for delivery";
            setLocalStep(next);
          }}
          onRelease={() => perform("release")}
          onReleasePreorder={() => setConfirmReleasePreorder(true)}
          onClearAppLabel={() => setConfirmClearAppLabel(true)}
          onClearLabelLock={() => setConfirmClearLabelLock(true)}
        />
        <aside className="rp-stack fw-aside" aria-label="Order summary">
          {order.paymentMismatch && !order.paymentMismatch.resolvedAt && order.paymentStatus !== "paid" && (
            <SectionCard title={order.paymentMismatch.paidAfterCancel ? "Paid after cancelling" : "Payment doesn't match"}>
              <p className="fw-summary">
                {order.paymentMismatch.paidAfterCancel
                  ? "The customer paid after this order was cancelled. Refund the payment in Stripe or PayPal, then mark it here."
                  : "The amount taken doesn't match this order. Refund or correct it in Stripe or PayPal, then mark it here."}
              </p>
              <SecondaryButton disabled={working} onClick={() => setConfirmAction("mismatch")}>Mark refunded</SecondaryButton>
            </SectionCard>
          )}
          {booksLeftOutAfterRefund(order) && (
            <SectionCard title="Books not back in stock">
              <p className="fw-summary">
                This order was refunded without putting its books back in stock, so they still count as gone
                (the inventory app shows them as a gratuity). If the books are still with you, put them back.
              </p>
              <SecondaryButton disabled={working} onClick={() => setConfirmAction("restockRefunded")}>Put the books back in stock</SecondaryButton>
            </SectionCard>
          )}
          {disputeOpen(order) && (
            <SectionCard title="Payment disputed">
              <p className="fw-summary">
                The customer's bank opened a chargeback ({String(order.disputeStatus).replace(/_/g, " ")}). The money is held until the bank decides.
                Packing, labels and dispatch are blocked until it is settled. Answer it in Stripe with your evidence (order details, tracking, messages) before its deadline.
              </p>
              {order.stripePaymentIntentId && (
                <div className="fw-actions">
                  <a className="rp-btn rp-btn-secondary rp-btn-sm" href={`https://dashboard.stripe.com/${order.stripeMode === "test" ? "test/" : ""}${order.disputeId ? `disputes/${order.disputeId}` : `payments/${order.stripePaymentIntentId}`}`} target="_blank" rel="noopener noreferrer">
                    Open in Stripe <ExternalLink size={12} aria-hidden />
                  </a>
                </div>
              )}
            </SectionCard>
          )}
          {Array.isArray(order.duplicatePayments) && order.duplicatePayments.length > 0 && (
            <SectionCard title="Paid twice">
              <p className="fw-summary">Stripe took more than one payment for this order. Keep the first and refund the extra in the Stripe Dashboard:</p>
              <ul className="fw-summary">
                {order.duplicatePayments.map((d: any, i: number) => {
                  const id = String(d?.paymentIntentId || d?.id || d || "");
                  return (
                    <li key={i}>
                      <a href={`https://dashboard.stripe.com/${order.stripeMode === "test" ? "test/" : ""}payments/${encodeURIComponent(id)}`} target="_blank" rel="noopener noreferrer" className="rp-mono">{id}</a>
                      {d?.amountMinor != null ? ` · ${formatMinor(Number(d.amountMinor), d.currency || "CAD")}` : ""}
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          )}
          {refundedMinor(order) > 0 && order.paymentStatus === "paid" && (
            <SectionCard title="Partly refunded">
              <p className="fw-summary">
                {formatMinor(refundedMinor(order), chargedOf(order).currency)} refunded so far of {formatMinor(chargedOf(order).minor, chargedOf(order).currency)}.
                {" "}{formatMinor(refundableMinor(order), chargedOf(order).currency)} remains. The order stays paid — check what still needs to ship.
              </p>
            </SectionCard>
          )}
          {giftCardConflictOpen(order) && (
            <SectionCard title="Gift card couldn't cover its part">
              <p className="fw-summary">
                The customer's payment arrived, but a gift card on this order no longer had enough balance (it may have been spent in another checkout, disabled or expired), so the order was not marked paid.
                Check the card in Gift cards, then refund the payment in Stripe or PayPal, or contact the customer to settle the difference. Don't ship until this is sorted.
              </p>
              {(order.giftCardRedemptions || []).length > 0 && (
                <div className="fw-actions">
                  {(order.giftCardRedemptions || []).map((r: any) => (
                    <a key={r.id} className="rp-btn rp-btn-secondary rp-btn-sm" href={`#gift-cards/${encodeURIComponent(r.id)}`}>Open gift card ••••{r.last4}</a>
                  ))}
                </div>
              )}
              <p className="fw-summary">A full refund in Stripe clears this by itself. If you settled it another way, mark it here.</p>
              <SecondaryButton disabled={working} onClick={() => setConfirmAction("giftConflict")}>Mark resolved</SecondaryButton>
            </SectionCard>
          )}
          {order.customerRequest?.type === "return" && (order.customerRequest.status === "open" || order.returnProgress) && <ReturnWorkbench key={`${order.id}-${order.returnProgress?.state || "requested"}`} order={order} onUpdated={loadOrder} />}
          {order.customerRequest?.status === "open" && order.customerRequest.type !== "return" && (
            <SectionCard title={order.customerRequest.type === "cancel" ? "Customer asks to cancel" : "Customer asks to return"}>
              <p className="fw-summary">
                Asked {new Date(order.customerRequest.createdAt).toLocaleString()}.
                {order.customerRequest.type === "cancel"
                  ? " Cancel or refund it from More order actions, or reply to explain why it has already gone out."
                  : " Agree the return with the customer, then refund from More order actions when the books are back."}
              </p>
              {order.customerRequest.message && <blockquote className="fw-summary">“{order.customerRequest.message}”</blockquote>}
              <SecondaryButton
                disabled={working}
                onClick={() => setConfirmAction("requestHandled")}
              >
                Mark request handled
              </SecondaryButton>
            </SectionCard>
          )}
          {/* Who and what was paid: side by side under the workbench when the order page is narrow. */}
          <div className="rp-stack fw-aside-info">
          <SectionCard title="Customer">
            <strong>{order.customer?.name || "Guest customer"}</strong>
            <p className="fw-summary">
              {customerMailto(order) ? <a href={customerMailto(order)}>{order.customer?.email}</a> : order.customer?.email}
              <br />
              {telHref(order.customer?.phone) ? <a href={telHref(order.customer?.phone)}>{order.customer?.phone}</a> : order.customer?.phone || ""}
            </p>
            {order.orderNote && (
              <div className="fw-notice" style={{ marginTop: 16 }}>
                <div>
                  <span className="rp-label">Customer note</span>
                  <p
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {order.orderNote}
                  </p>
                </div>
              </div>
            )}
            <div className="fw-actions">
              {customerMailto(order) && (
                <a className="rp-btn rp-btn-secondary rp-btn-sm" href={customerMailto(order)}>Email customer</a>
              )}
              <SecondaryButton
                size="sm"
                icon={<Copy size={14} aria-hidden />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      order.customer?.email || "",
                    );
                    toast.success("Email copied");
                  } catch {
                    toast.error("Could not copy email");
                  }
                }}
              >
                Copy email
              </SecondaryButton>
              <SecondaryButton
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `${order.customer?.name || ""}\n${[addr.street, addr.unit].filter(Boolean).join(", ")}\n${addr.city || ""}, ${addr.state || ""} ${addr.zip || ""}\n${addr.country || ""}`,
                    );
                    toast.success("Address copied");
                  } catch {
                    toast.error("Could not copy address");
                  }
                }}
              >
                Copy address
              </SecondaryButton>
            </div>
            {order.ipCountryMatchesShipping === false && (
              <p className="fw-problems">
                Location mismatch: placed from {order.ipCountry || "unknown"};
                shipping to {addr.country}.
              </p>
            )}
          </SectionCard>
          {acquisitionRows(order).length > 0 && (
            <SectionCard title="How they found you">
              <dl style={{ margin: 0, display: "grid", gap: 10 }}>
                {acquisitionRows(order).map(row => (
                  <div key={row.label} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 35%) 1fr", gap: 12 }}>
                    <dt className="rp-label">{row.label}</dt>
                    <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          )}
          <SectionCard title="Payment summary">
            <dl style={{ margin: 0, display: "grid", gap: 12 }}>
              {[
                ["Subtotal", money(order.subtotal)],
                ["Shipping", money(order.shipping)],
                ...(order.tax > 0 ? [["Tax", money(order.tax)]] : []),
                ...(order.discount > 0
                  ? [[order.appliedDiscount?.type === "gift" ? `Free gift${discountLabel(order) ? ` · ${discountLabel(order)}` : ""}` : `Discount${discountLabel(order) ? ` · ${discountLabel(order)}` : ""}`, `− ${money(order.discount)}`]]
                  : []),
                ...(giftCardPaid(order) > 0
                  ? [[`Gift card${(order.giftCardRedemptions || []).length ? ` (${(order.giftCardRedemptions || []).map((r: any) => `••••${r.last4}`).join(", ")})` : ""}`, `− ${money(giftCardPaid(order))}`]]
                  : []),
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <dt>{k}</dt>
                  <dd className="rp-mono" style={{ margin: 0 }}>
                    {v}
                  </dd>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  borderTop: "1px solid var(--rp-divider)",
                  paddingTop: 16,
                }}
              >
                <dt>
                  <strong>{giftCardPaid(order) > 0 ? "Paid by card / PayPal" : "Total"}</strong>
                </dt>
                <dd className="rp-mono" style={{ margin: 0, fontWeight: 700 }}>
                  {money(order.total)}
                </dd>
              </div>
              {order.expectedAmountMinor != null && String(order.expectedCurrency || "CAD").toUpperCase() !== "CAD" && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <dt>Charged in {String(order.expectedCurrency).toUpperCase()}</dt>
                  <dd className="rp-mono" style={{ margin: 0 }}>{formatMinor(Number(order.expectedAmountMinor), order.expectedCurrency)}</dd>
                </div>
              )}
              {refundedMinor(order) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <dt>Refunded</dt>
                  <dd className="rp-mono" style={{ margin: 0 }}>− {formatMinor(refundedMinor(order), chargedOf(order).currency)}</dd>
                </div>
              )}
            </dl>
            {hasStripePayment(order) && (
              <div className="fw-actions">
                <SecondaryButton size="sm" disabled={checkingPayment} onClick={() => checkStripePayment(true)}>
                  {checkingPayment ? "Checking with Stripe…" : "Sync with Stripe"}
                </SecondaryButton>
              </div>
            )}
            {order.stripePaymentIntentId && (
              <div className="fw-actions">
                <a
                  className="rp-btn rp-btn-secondary rp-btn-sm"
                  href={`https://dashboard.stripe.com/${order.stripeMode === "test" ? "test/" : ""}payments/${order.stripePaymentIntentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View payment in Stripe <ExternalLink size={12} aria-hidden />
                </a>
              </div>
            )}
            {order.status === "completed" && order.trackingNumber && (
              <div className="fw-actions">
                <a
                  className="rp-btn rp-btn-secondary rp-btn-sm"
                  href={getTrackingUrl(
                    order.trackingCarrier,
                    order.trackingNumber,
                    order.trackingUrl,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Track parcel <ExternalLink size={12} aria-hidden />
                </a>
              </div>
            )}
          </SectionCard>
          {issuedGiftCards(order).length > 0 && (
            <SectionCard title="Gift cards issued" description="Created when this order was paid and emailed to each recipient.">
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {issuedGiftCards(order).map((card) => (
                  <li key={card.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <a href={`#gift-cards/${encodeURIComponent(card.id)}`} className="rp-mono" style={{ color: "inherit", textDecoration: "underline" }}>••••{card.last4}</a>
                    <span className="rp-mono">{money((Number(card.minor) || 0) / 100)}</span>
                    {card.recipientEmail && <span className="rp-hint" style={{ flexBasis: "100%", overflowWrap: "anywhere" }}>To {card.recipientEmail}</span>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          </div>
        </aside>
      </div>
      <details className="fw-notes" data-print="hide">
        <summary>
          Activity & internal notes{" "}
          <span className="rp-hint">({activity.length})</span>
        </summary>
        <div className="fw-note-form">
          <div>
            <TextArea
              rows={2}
              label="Internal note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="Visible to your team only"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleAddNote();
                }
              }}
            />
          </div>
          <SecondaryButton
            disabled={working || !note.trim()}
            onClick={handleAddNote}
          >
            Add note
          </SecondaryButton>
        </div>
        <Tabs<"all" | "event" | "note">
          label="Activity filter"
          value={timelineFilter}
          onChange={setTimelineFilter}
          tabs={[
            { id: "all", label: "All entries" },
            { id: "event", label: "Events" },
            { id: "note", label: "Notes" },
          ]}
        />
        {activity.length ? (
          <ol className="fw-activity" aria-label="Order activity">
            {[...activity].reverse().map((e: any, i: number) => (
              <li key={i}>
                <time className="rp-hint" dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleString()}
                </time>
                <p>{e.message}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rp-hint">No activity recorded yet.</p>
        )}
        <h3 className="rp-label" style={{ marginTop: 16 }}>Emails about this order</h3>
        {emailLog === null ? (
          <p className="rp-hint">Loading delivery log…</p>
        ) : emailLogFailed ? (
          <p className="rp-hint" role="alert">
            Couldn't load the delivery log for this order.{" "}
            <SecondaryButton size="sm" onClick={loadEmailLog}>Retry</SecondaryButton>
          </p>
        ) : emailLog.length ? (
          <ol className="fw-activity" aria-label="Emails about this order">
            {emailLog.map((row: any) => (
              <li key={row.id}>
                <time className="rp-hint" dateTime={row.at}>{row.at ? new Date(row.at).toLocaleString() : ""}</time>
                <p>
                  <StatusBadge tone={row.status === "sent" ? "success" : row.status === "failed" ? "danger" : "warning"}>
                    {row.status === "sent" ? "Sent" : row.status === "failed" ? "Failed" : row.status === "queued" ? "Waiting to retry" : String(row.status || "")}
                  </StatusBadge>{" "}
                  {row.subject} → {row.to}
                </p>
                {row.error && <p className="rp-hint">{row.error}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rp-hint">No emails recorded for this order yet (emails sent before October 2026 aren't linked to orders).</p>
        )}
      </details>
      <Dialog
        open={!!showShipForm}
        onClose={() => !isShipping && setShowShipForm(false)}
        title={showShipForm === "edit" ? (hasLabel ? "Edit tracking link or number" : "Correct tracking") : "Confirm dispatch"}
        description={
          showShipForm === "edit"
            ? hasLabel
              ? "Change the link behind Track shipment. The customer is not emailed again; their account and order tracking page use the new link."
              : "Fix the carrier, tracking number or link. The customer is not emailed again; their account and order tracking page show the new details."
            : "Confirm only after handing the parcel to the carrier. This sends the customer's shipping email with the tracking number and a Track shipment button."
        }
        footer={
          <>
            <SecondaryButton
              disabled={isShipping}
              onClick={() => setShowShipForm(false)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              disabled={
                isShipping ||
                (showShipForm === "dispatch" && (!!problem || testLabel)) ||
                (!hasLabel && (!trackingNumber.trim() || !carrierName)) ||
                (!!trackingLink.trim() && !cleanTrackingLink(trackingLink))
              }
              onClick={markAsShipped}
            >
              {isShipping
                ? "Saving…"
                : showShipForm === "edit"
                  ? "Save tracking"
                  : "Mark as shipped"}
            </PrimaryButton>
          </>
        }
      >
        <div className="rp-stack">
          {showShipForm === "edit" && rawLabel && (
            <Checkbox
              label="This label was voided or replaced — enter the real carrier and tracking number"
              checked={labelReplaced}
              onChange={(event: any) => setLabelReplaced(event.target.checked)}
            />
          )}
          {hasLabel ? (
            <p className="fw-summary" style={{ margin: 0 }}>
              <strong>Shippo label:</strong> {order.trackingCarrier || "Carrier"} · {order.trackingNumber}
            </p>
          ) : (
          <>
          <SelectField
            label="Carrier"
            value={trackingCarrier}
            onChange={(e) => setTrackingCarrier(e.target.value)}
          >
            {[...CARRIERS, "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectField>
          {trackingCarrier === "Other" && (
            <TextField
              label="Carrier name"
              value={otherCarrier}
              onChange={(e) => setOtherCarrier(e.target.value)}
              maxLength={80}
              placeholder="e.g. Intelcom"
            />
          )}
          <TextField
            label="Tracking number"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            maxLength={100}
            placeholder="Enter the carrier tracking number"
          />
          </>
          )}
          <TextField
            label="Tracking link (optional)"
            value={trackingLink}
            onChange={(e) => setTrackingLink(e.target.value)}
            placeholder="https://…"
            error={
              trackingLink.trim() && !cleanTrackingLink(trackingLink)
                ? "The link must start with https://"
                : undefined
            }
            hint={`This is the link behind Track shipment in the customer's email, account and order tracking page. Filled in automatically from ${(hasLabel ? order.trackingCarrier : carrierName) || "the carrier"}'s tracking page; replace it to use your own link.`}
          />
          {(hasLabel || (trackingNumber.trim() && carrierName)) && (
            <a
              className="rp-btn rp-btn-secondary rp-btn-sm"
              href={hasLabel
                ? getTrackingUrl(order.trackingCarrier || "", order.trackingNumber, trackingLink)
                : getTrackingUrl(carrierName, trackingNumber, trackingLink)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ alignSelf: "flex-start" }}
            >
              Test tracking link <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {showShipForm === "dispatch" && testLabel && (
            <p className="fw-problems" role="alert" style={{ margin: 0 }}>
              This is a TEST label bought with a Shippo test key, so it won't carry a parcel. Close this, use Wrong label? Replace it and buy a live label before shipping.
            </p>
          )}
          {showShipForm === "dispatch" && (
            <p className="rp-hint" role="status" style={{ margin: 0 }}>
              {emailSettingsFailed
                ? emailUnknownText
                : emailOn("shipping_confirmation")
                ? `Customer will be emailed: Shipping confirmation to ${order.customer?.email || "their address"}, with the tracking link.`
                : "The Shipping confirmation email is switched off (Settings › Email sender), so the customer will not be emailed."}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!deliveryStatus}
        onClose={() => !isShipping && setDeliveryStatus(null)}
        title={deliveryStatus === "delivered" ? "Mark delivered?" : "Mark out for delivery?"}
        description={
          deliveryStatus === "delivered"
            ? "Use this when the carrier shows the parcel as delivered. The order moves to Completed. No email is sent; the customer already had the shipping email."
            : "Use this when the carrier shows the parcel out for delivery. This only updates the order; the customer already had the shipping email, so no extra email is sent."
        }
        footer={
          <>
            <SecondaryButton disabled={isShipping} onClick={() => setDeliveryStatus(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={isShipping} onClick={updateDeliveryStatus}>
              {isShipping
                ? "Saving…"
                : deliveryStatus === "delivered"
                  ? "Mark delivered"
                  : "Mark out for delivery"}
            </PrimaryButton>
          </>
        }
      >
        <p className="rp-hint" style={{ margin: 0 }}>
          {order.trackingCarrier || "Carrier"} · {order.trackingNumber || "No tracking recorded"}
        </p>
      </Dialog>
      <Dialog
        open={!!localStep}
        onClose={() => !working && setLocalStep(null)}
        title="Confirm this step?"
        description={localStep ? `You're about to ${localStep}.` : ""}
        footer={
          <>
            <SecondaryButton disabled={working} onClick={() => setLocalStep(null)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              disabled={working}
              onClick={async () => {
                await perform("local_transition", { expectedStatus: order.fulfillmentStatus || "" });
                setLocalStep(null);
              }}
            >
              Confirm
            </PrimaryButton>
          </>
        }
      >
        <p className="rp-hint" style={{ margin: 0 }}>
          {order.fulfillment?.name || "Local order"}
        </p>
      </Dialog>
      <Dialog
        open={confirmResend}
        onClose={() => !isShipping && setConfirmResend(false)}
        title="Resend shipping email?"
        description={`Sends the Shipping confirmation email to ${order.customer?.email || "the customer"} again with the current tracking.`}
        footer={
          <>
            <SecondaryButton disabled={isShipping} onClick={() => setConfirmResend(false)}>
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={isShipping || !emailOn("shipping_confirmation")} onClick={resendShippingEmail}>
              {isShipping ? "Sending…" : "Resend email"}
            </PrimaryButton>
          </>
        }
      >
        <p className="rp-hint" style={{ margin: 0 }}>
          {emailSettingsFailed
            ? emailUnknownText
            : emailOn("shipping_confirmation")
            ? `${order.trackingCarrier || "Carrier"} · ${order.trackingNumber || "No tracking recorded"}`
            : "The Shipping confirmation email is switched off in Settings › Email sender."}
        </p>
      </Dialog>
      <Dialog
        open={showHold}
        onClose={() => !working && setShowHold(false)}
        title="Place order on hold"
        description="Pause packing and shipping while you resolve an issue."
        footer={
          <>
            <SecondaryButton
              disabled={working}
              onClick={() => setShowHold(false)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              disabled={working || !holdReason.trim()}
              onClick={() => perform("hold", { reason: holdReason })}
            >
              Place on hold
            </PrimaryButton>
          </>
        }
      >
        <TextField
          label="Hold reason"
          value={holdReason}
          onChange={(e) => setHoldReason(e.target.value)}
          maxLength={500}
          placeholder="e.g. Confirm replacement address with customer"
        />
      </Dialog>
      <Dialog
        open={showRefund}
        onClose={() => !isVoiding && setShowRefund(false)}
        title="Refund order"
        description="Choose the refund reason and whether books should return to stock. You will review the refund before it is submitted."
        footer={
          <>
            <SecondaryButton onClick={() => setShowRefund(false)}>
              Cancel
            </SecondaryButton>
            <DestructiveButton
              disabled={!!refundAmountPlan().error || (refundReason === "Other" && !refundOther.trim())}
              onClick={() => {
                setShowRefund(false);
                setConfirming("refund");
              }}
            >
              Review refund
            </DestructiveButton>
          </>
        }
      >
        <div className="rp-stack">
          <TextField
            label={`Amount to refund (${chargedOf(order).currency})`}
            inputMode="decimal"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder={(refundableMinor(order) / 100).toFixed(2)}
            error={refundAmountPlan().error || undefined}
            hint={`Leave blank to refund everything left: ${formatMinor(refundableMinor(order), chargedOf(order).currency)}${refundedMinor(order) ? ` (${formatMinor(refundedMinor(order), chargedOf(order).currency)} already refunded)` : ""}. A smaller amount is a partial refund: the order stays paid.`}
          />
          {refundReason === "Other" && (
            <TextField label="Reason" value={refundOther} maxLength={300} onChange={(e) => setRefundOther(e.target.value)} placeholder="e.g. Price adjustment" />
          )}
          <SelectField
            label="Refund reason"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
          >
            {[
              "Customer request",
              "Damaged in transit",
              "Out of stock",
              "Wrong item sent",
              "Duplicate order",
              "Other",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </SelectField>
          {refundAmountPlan().partial ? (
            <fieldset style={{ margin: 0, padding: 0, border: 0 }} className="rp-stack">
              <legend className="rp-label">Put copies back in stock (optional)</legend>
              <p className="rp-hint" style={{ margin: 0 }}>Nothing goes back to stock unless you tick it.</p>
              {(order.items || []).map((item: any, index: number) => isDigitalItem(item) ? null : (
                <div key={index} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <Checkbox
                    label={`${item.title}${item.variantName ? ` · ${item.variantName}` : ""}`}
                    checked={(refundRestockLines[index] || 0) > 0}
                    onChange={(e) => setRefundRestockLines((prev) => ({ ...prev, [index]: e.target.checked ? 1 : 0 }))}
                  />
                  {(refundRestockLines[index] || 0) > 0 && (
                    <TextField label="Copies" type="number" min={1} max={item.quantity} step={1} style={{ width: 90 }}
                      value={refundRestockLines[index]}
                      onChange={(e) => setRefundRestockLines((prev) => ({ ...prev, [index]: Math.max(0, Math.min(Number(item.quantity) || 0, Math.floor(Number(e.target.value) || 0))) }))} />
                  )}
                </div>
              ))}
            </fieldset>
          ) : (
            <Checkbox
              label="Restock items"
              checked={restockOnRefund}
              onChange={(e) => setRestockOnRefund(e.target.checked)}
            />
          )}
        </div>
      </Dialog>
      <Dialog
        open={!!editAddress}
        onClose={() => !working && setEditAddress(null)}
        title="Correct shipping address"
        description="Use the address confirmed by the customer. Corrections require a new address review."
        footer={
          <>
            <SecondaryButton
              disabled={working}
              onClick={() => setEditAddress(null)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={working} onClick={saveAddress}>
              Save corrected address
            </PrimaryButton>
          </>
        }
      >
        {editAddress && (
          <div className="rp-stack">
            <p className="rp-hint" style={{ margin: 0 }}>{lockedAddressFields(order).reason}</p>
            {["street", "unit", "city", "state", "zip", "country"].map((k) => (
              <TextField
                key={k}
                readOnly={lockedAddressFields(order).fields.includes(k)}
                hint={lockedAddressFields(order).fields.includes(k) ? "Can't change on a paid order" : undefined}
                label={
                  k === "unit" ? "Apartment / unit (optional)" : k === "state"
                    ? "Province / state"
                    : k === "zip"
                      ? "Postal / ZIP code"
                      : k[0].toUpperCase() + k.slice(1)
                }
                value={editAddress[k] || ""}
                onChange={(e) =>
                  setEditAddress((prev: any) => ({
                    ...prev,
                    [k]: e.target.value,
                  }))
                }
              />
            ))}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirming === "refund"}
        title="Refund this order?"
        confirmLabel="Refund order"
        message={refundAmountPlan().partial
          ? `Refund ${formatMinor(refundAmountPlan().minor, refundAmountPlan().currency)} of this order${isManualPayment ? " (recorded only — send the money back yourself)" : order.paypalCaptureId ? " through PayPal" : " through Stripe"}? The order stays paid.${Object.values(refundRestockLines).some((q) => q > 0) ? ` ${Object.values(refundRestockLines).reduce((a, b) => a + b, 0)} ticked cop${Object.values(refundRestockLines).reduce((a, b) => a + b, 0) === 1 ? "y goes" : "ies go"} back to stock.` : " Nothing is restocked."} This can't be undone.`
          : `${formatMinor(refundableMinor(order), chargedOf(order).currency)} — ${isManualPayment ? "Refund this paid manual order?" : order.paypalCaptureId ? "Refund this paid order through PayPal?" : "Refund this paid order through Stripe?"}${restockOnRefund ? " The purchased quantities will also be restocked." : ""} This action is irreversible.`}
        onConfirm={handleRefund}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirmAction === "markPaid"}
        title="Payment received?"
        confirmLabel="Mark paid"
        message={`Only continue once ${money(order.total)} has arrived by ${order.paymentMethod || "the manual method"}. The order becomes paid, its books come off stock and the customer gets their order confirmation email.`}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "mismatch"}
        title="Mark this payment refunded?"
        confirmLabel="Mark refunded"
        message="Only continue after you've refunded the unexpected payment in Stripe or PayPal. This clears the warning from Needs attention; it does not send any money."
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "giftConflict"}
        title="Mark this gift card problem resolved?"
        confirmLabel="Mark resolved"
        message="Only mark this resolved if you refunded or settled it elsewhere. This clears the warning from Needs attention; it does not move any money or mark the order paid."
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "requestHandled"}
        title="Mark the customer's request handled?"
        confirmLabel="Mark handled"
        message="The request leaves Needs attention and can't be reopened. Nothing is cancelled, refunded or emailed — do that from More order actions first if you agreed to it."
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmReleasePreorder}
        title="Ship this pre-order now?"
        confirmLabel="Ready to ship now"
        message="Only continue if every pre-ordered book on this order is in the shop. The order moves to Ready to pack before its release date and stays there even if the date changes."
        onConfirm={() => { setConfirmReleasePreorder(false); void perform("release_preorder"); }}
        onCancel={() => setConfirmReleasePreorder(false)}
      />
      <ConfirmDialog
        open={confirmAction === "restockRefunded"}
        title="Put the books back in stock?"
        confirmLabel="Put them back"
        message="Only continue if the books from this order are still with you. Their copies go back in stock, and the inventory app turns this order's gratuity into a void sale. No money moves."
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "resetDownloads"}
        title="Reset download limits?"
        confirmLabel="Reset downloads"
        message={`Each digital book on this order can be downloaded ${DOWNLOAD_LIMIT} times. This gives ${order.customer?.email || "the customer"} a fresh ${DOWNLOAD_LIMIT} downloads of each. Nothing is emailed.`}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "resendConfirmation"}
        title="Resend order confirmation?"
        confirmLabel="Resend email"
        message={emailSettingsFailed
          ? emailUnknownText
          : emailOn("order_confirmation")
          ? `Sends the Order confirmed email to ${order.customer?.email || "the customer"} again. The shop's new-order email is not repeated.`
          : "The Order confirmation email is switched off in Settings › Email sender, so nothing will be sent."}
        onConfirm={runConfirmed}
        onCancel={() => setConfirmAction(null)}
      />
      <Dialog
        open={showReplaceLabel}
        onClose={() => !replacing && setShowReplaceLabel(false)}
        title={order && terminal(order) ? "Void this unused label?" : "Void or replace this label?"}
        description={order && terminal(order)
          ? "The order is cancelled or refunded, so this label won't be used. Voiding it asks Shippo to refund the postage."
          : "Use this when the label was bought for the wrong weight, address or service, or the parcel won't be sent. The parcel must not have left the shop."}
        footer={
          <>
            <SecondaryButton disabled={replacing} onClick={() => setShowReplaceLabel(false)}>Cancel</SecondaryButton>
            <DestructiveButton disabled={replacing} onClick={replaceLabel}>
              {replacing ? "Voiding…" : voidedElsewhere ? "Forget this label" : "Void label in Shippo"}
            </DestructiveButton>
          </>
        }
      >
        <div className="rp-stack">
          <p style={{ margin: 0 }}>
            Label <span className="rp-mono">{order.trackingNumber || ""}</span> will be voided with Shippo and removed from this order{order && terminal(order) ? "" : "; you can then buy a new one"}. Shippo refunds labels that are unused and less than 90 days old, usually within 14 business days, as a credit on your Shippo invoice. The refund's progress shows on this order. Nothing is emailed to the customer.
          </p>
          <Checkbox
            label="I already voided it in Shippo — just remove it from this order"
            checked={voidedElsewhere}
            onChange={(event: any) => setVoidedElsewhere(event.target.checked)}
          />
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmClearLabelLock}
        title="Allow a new label?"
        confirmLabel="Allow a new label"
        message="Only continue if you've checked this order in Shippo and no label was bought (or you voided it there). Otherwise you may pay for two labels. This is recorded in the order's history."
        onConfirm={handleClearLabelLock}
        onCancel={() => setConfirmClearLabelLock(false)}
      />
      <ConfirmDialog
        open={confirmClearAppLabel}
        title="Remove the inventory app label?"
        confirmLabel="Remove label"
        message="Its tracking comes off this order, so the website can buy its own label. The label itself isn't voided: void it (or reuse it) in the inventory app, or you may pay for two. This is recorded in the order's history."
        onConfirm={() => { setConfirmClearAppLabel(false); void perform("clear_app_label"); }}
        onCancel={() => setConfirmClearAppLabel(false)}
      />
      <ConfirmDialog
        open={confirming === "cancel"}
        title="Cancel this unpaid order?"
        confirmLabel="Cancel order"
        message="No Stripe refund will be created."
        onConfirm={handleCancelUnpaid}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
