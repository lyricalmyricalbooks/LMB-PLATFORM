import { useState, useEffect, useMemo, useRef, type SyntheticEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import toast from "react-hot-toast";
import { placeItemsTable, risoButton, risoLayout } from "./emailTheme";
import { orderPreviewVars, previewItemsTable } from "./emailPreviewData";
import { GmailSendingCard } from "./GmailSendingCard";
import { useSenderStatus } from "./senderStatus";
import { currentRows } from "./emailLogDisplay";
import { emailSenderData } from "./emailSenderApi";
import { deliveryStats, sendMethod } from "./emailSenderView";
import { EmailDeliveries, type QueuedEmail } from "./EmailDeliveries";
import { EmailSendingSetup } from "./EmailSendingSetup";
import "./emailSender.css";
import { fillSample, insertAt, PLACEHOLDERS, problemTemplates, templateProblems, withRequiredPlaceholders, type EmailLanguage, type TemplateFields } from "./emailTemplateChecks";
import { FRENCH_DEFAULTS } from "./emailFrenchDefaults";
import { adminApi } from "./api";
import { DEFAULT_SHOP_NAME, pressName } from "../features/site/shopIdentity";
import { useSettingsDirty } from "./settingsDirty";
import { resendKeyProblem } from "./privateKeys";
import { senderOf, senderProblems, withSender, type Sender } from "./senderSettings";
import { emailFunction, lastGmailProblem } from "./notificationApi";
import { plainError } from "./plainError";
import { runsOnColophon } from "../../lib/shopProfile";
import { useSubTab } from "./settingsLayout";
import { combinedAdmin } from "./combined";
import { useShopSells } from "./shopWords";
import { emailDefaultsFor, sellsBooks, withShopEmailWords } from "../../shared/shopSells";
import {
  ErrorState, GhostButton, PrimaryButton, LoadingState, SaveBar, SecondaryButton, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";

type EmailView = "email-templates" | "email-setup" | "email-deliveries";

type EmailLogEntry = {
  id: string;
  at?: string;
  to?: string;
  subject?: string;
  /** "fallback" = Gmail missed and the backup sender (Resend) was tried; the next row has the outcome.
   *  "queued" = every sender refused it; the retry queue will try again. "cancelled" = the owner stopped it. */
  status?: "sent" | "failed" | "fallback" | "bounced" | "complained" | "queued" | "cancelled";
  error?: string;
  note?: string;
  keySource?: string;
  sandbox?: boolean;
  from?: string;
  attempt?: number;
  retryAt?: string | null;
  outboxId?: string;
};




type NotificationSettings = {
  brand: {
    logoUrl: string;
    brandColor: string;
    emailTheme?: "light" | "dark" | "market" | "index";
    resendApiKey?: string;
    resendApiKeyStored?: boolean;
  };
  order_confirmation: TemplateFields;
  order_pending_payment: TemplateFields;
  shipping_confirmation: TemplateFields;
  /** Part of an order sent in its own parcel (code plan 24.5). */
  part_shipped: TemplateFields;
  abandoned_cart: TemplateFields;
  order_cancelled: TemplateFields;
  order_refunded: TemplateFields;
  customer_welcome: TemplateFields;
  delivery_update: TemplateFields;
  /** A shipped parcel is out for delivery or delivered (code plan 25.5); off until switched on. */
  carrier_delivery_update: TemplateFields;
  /** The shopper asked to cancel or return an order (code plan 25.7). */
  request_received: TemplateFields;
  /** A delayed bank payment failed after checkout (code plan 25.8). */
  payment_failed: TemplateFields;
  /** A pickup order the owner marked collected (code plan 25.6). */
  order_picked_up: TemplateFields;
  /** Two days before an unpaid payment link closes (code plan 21.5). */
  payment_link: TemplateFields;
  payment_link_reminder: TemplateFields;
  contact_reply: TemplateFields;
  gift_card: TemplateFields;
  /** Off unless switched on (server checks enabled === true); sent delayDays after shipping. */
  review_request: TemplateFields & { delayDays?: number };
  /** Older saved switch for the shop's new-order email; read only as shopAlerts.newOrder's fallback. */
  new_order_admin?: { enabled?: boolean };
  /** Emails to the shop itself; on unless switched off. */
  shopAlerts: { newOrder: boolean; shipped: boolean; dailyOrderDigest?: boolean; lowStock?: boolean; weeklySummary?: boolean; fairDaySummary?: boolean; socialPostFailed?: boolean };
};

type TemplateKey = Exclude<keyof NotificationSettings, "brand" | "new_order_admin" | "shopAlerts">;

const DEFAULT_SETTINGS: NotificationSettings = {
  brand: {
    logoUrl: "",
    brandColor: "#a9e8c6",
    emailTheme: "light",
    resendApiKey: ""
  },
  order_confirmation: {
    subject: "Order confirmed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your purchase! We've received your order and are preparing it for shipment. We will send you another email when it has shipped.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  order_pending_payment: {
    subject: "Order received — payment needed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your order! It is reserved for you, but it is not paid yet. Please pay {{total_price}} by {{payment_method}} using the instructions below. We'll confirm by email as soon as your payment arrives and then prepare your order.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  shipping_confirmation: {
    subject: "Your order is on the way!",
    body: "Hi {{customer_name}},\n\nGood news! Your order {{order_id}} has shipped with {{tracking_carrier}} and is on its way.\n\nTracking number: {{tracking_number}}\n\nUse the button below to follow your parcel on the carrier's website.",
    buttonText: "Track your shipment",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/index.js DEFAULT_NOTIFICATIONS.part_shipped.
  part_shipped: {
    subject: "Part of your order {{order_id}} is on the way",
    body: "Hi {{customer_name}},\n\nPart of your order {{order_id}} has shipped with {{tracking_carrier}}:\n\n{{items_list}}\n\nTracking number: {{tracking_number}}\n\nThe rest of your order will follow in another parcel, and we'll email you when it ships.",
    buttonText: "Track this parcel",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  abandoned_cart: {
    subject: "Did you forget something?",
    body: "Hi {{customer_name}},\n\nWe noticed you left some items in your cart. We've saved them for you, so you can easily complete your purchase whenever you're ready!",
    buttonText: "Resume purchase",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  order_cancelled: {
    subject: "Order cancelled: {{order_id}}",
    body: "Hi {{customer_name}},\n\nYour order has been cancelled and you will not be charged. If you have any questions, please contact us.",
    buttonText: "",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  order_refunded: {
    subject: "Order refunded: {{order_id}}",
    body: "Hi {{customer_name}},\n\nWe have successfully refunded {{total_price}} for your order. The funds should return to your original payment method in 5-10 business days.",
    buttonText: "",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  customer_welcome: {
    subject: "Welcome to {{shop_name}}!",
    body: "Hi {{customer_name}},\n\nThank you for creating an account with {{shop_name}}! You can now log in to view your orders, save shipping addresses, and download digital library books.",
    buttonText: "Go to your account",
    signoff: "Warmly,\nThe {{shop_name}} team",
    enabled: true
  },
  contact_reply: {
    subject: "We got your message",
    body: "Hi {{customer_name}},\n\nThanks for getting in touch with {{shop_name}}! We've received your message and will reply as soon as we can.",
    buttonText: "",
    signoff: "Warmly,\nThe {{shop_name}} team",
    enabled: true
  },
  gift_card: {
    subject: "You've received a {{amount}} gift card",
    body: "Hi {{recipient_name}},\n\n{{sender_name}} sent you a {{amount}} gift card for {{shop_name}}.\n\n{{message}}\n\nYour gift card code: {{code}}\n\nEnter this code at checkout to use it. Any balance left over stays on the card for next time. {{expires}}",
    buttonText: "Shop now",
    signoff: "Happy reading,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/index.js DEFAULT_NOTIFICATIONS.payment_link (Orders › order to pay › Send by email).
  payment_link: {
    subject: "Your order {{order_id}} from {{shop_name}} is ready to pay",
    body: "Hi {{customer_name}},\n\nYour order from {{shop_name}} is ready. The total is {{total_price}}, and you can pay by card until {{expires_on}}.\n\n{{note}}",
    buttonText: "Pay now",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/index.js DEFAULT_NOTIFICATIONS.payment_link_reminder.
  payment_link_reminder: {
    subject: "Reminder: your order {{order_id}} is ready to pay",
    body: "Hi {{customer_name}},\n\nJust a reminder that your order from {{shop_name}} is waiting for payment. The total is {{total_price}}, and the payment link stays open until {{expires_on}}.",
    buttonText: "Pay now",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  delivery_update: {
    subject: "Delivery Update: Your order is {{status}}",
    body: "Hi {{customer_name}},\n\nYour package tracking status has been updated: {{status}}.\n\nCarrier: {{tracking_carrier}}\nTracking: {{tracking_number}}",
    buttonText: "Track shipment",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/index.js DEFAULT_NOTIFICATIONS.carrier_delivery_update, request_received and payment_failed.
  carrier_delivery_update: {
    subject: "Your order {{order_id}} is {{status}}",
    body: "Hi {{customer_name}},\n\nYour order {{order_id}} is {{status}}.\n\nCarrier: {{tracking_carrier}}\nTracking number: {{tracking_number}}",
    buttonText: "Track your parcel",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: false
  },
  request_received: {
    subject: "We got your request for order {{order_id}}",
    body: "Hi {{customer_name}},\n\nThanks for letting us know. We received your request to {{request}} order {{order_id}}, and we'll reply by email soon with the next steps.",
    buttonText: "View your order",
    signoff: "Best,\nThe {{shop_name}} team",
    enabled: true
  },
  payment_failed: {
    subject: "Your payment for order {{order_id}} didn't go through",
    body: "Hi {{customer_name}},\n\nYour bank let us know that the {{total_price}} payment for order {{order_id}} didn't go through, so the order isn't paid yet.\n\nIf you'd still like it, reply to this email and we'll help you pay another way.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/index.js DEFAULT_NOTIFICATIONS.order_picked_up.
  order_picked_up: {
    subject: "Thanks for picking up order {{order_id}}",
    body: "Hi {{customer_name}},\n\nYou've picked up order {{order_id}}. Thank you for shopping with {{shop_name}}! Keep this email as your receipt.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe {{shop_name}} team",
    enabled: true
  },
  // Mirrors functions/reviewRequests.js REVIEW_REQUEST_TEMPLATE.
  review_request: {
    subject: "How are you finding your book?",
    body: "Hi {{customer_name}},\n\nWe hope your books from order {{order_id}} arrived safely. If you have a moment, we'd love to hear what you think — a short review helps other readers find their next book. Each title below opens its page, where the review form is.",
    buttonText: "Write a review",
    signoff: "Thanks for reading,\nThe {{shop_name}} team",
    enabled: false,
    delayDays: 14
  },
  shopAlerts: { newOrder: true, shipped: true, dailyOrderDigest: true, lowStock: true, weeklySummary: true, fairDaySummary: true, socialPostFailed: true }
};

// Every customer email the editor shows. A template added to DEFAULT_SETTINGS appears
// automatically (under its TAB_META group, else "Other").
const TAB_META: Record<string, { label: string; group: string }> = {
  order_confirmation: { label: "Order Paid", group: "orders" },
  order_pending_payment: { label: "Awaiting Payment", group: "orders" },
  shipping_confirmation: { label: "Order Shipped", group: "orders" },
  part_shipped: { label: "Part Shipped", group: "orders" },
  delivery_update: { label: "Delivery", group: "orders" },
  carrier_delivery_update: { label: "Out for delivery", group: "orders" },
  request_received: { label: "Return or cancel request", group: "orders" },
  payment_failed: { label: "Payment didn't go through", group: "orders" },
  order_picked_up: { label: "Picked up", group: "orders" },
  order_cancelled: { label: "Order Cancelled", group: "orders" },
  order_refunded: { label: "Order Refunded", group: "orders" },
  review_request: { label: "Review request", group: "orders" },
  payment_link: { label: "Payment link", group: "orders" },
  payment_link_reminder: { label: "Payment link reminder", group: "orders" },
  abandoned_cart: { label: "Abandoned Cart", group: "cart" },
  customer_welcome: { label: "Welcome", group: "account" },
  contact_reply: { label: "Message received", group: "contact" },
  gift_card: { label: "Gift card", group: "giftCards" },
};
const GROUP_LABELS: Record<string, string> = { orders: "Orders", cart: "Cart", account: "Account", contact: "Contact form", giftCards: "Gift cards", other: "Other" };
const TEMPLATE_IDS = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "brand" && k !== "new_order_admin" && k !== "shopAlerts") as TemplateKey[];
const TABS = TEMPLATE_IDS.map((id) => ({ id, label: TAB_META[id]?.label || id.replace(/_/g, " "), group: TAB_META[id]?.group || "other" }));
const GROUP_IDS = [...Object.keys(GROUP_LABELS).filter((g) => TABS.some((t) => t.group === g)), "shopAlerts"];

// The list's two main categories; the rest sit under "More".
const MAIN_GROUPS = ["orders", "cart"];
// The order an order's emails happen in, as the redesign lists them (anything not named goes last).
const LIST_ORDER = ["order_confirmation", "order_pending_payment", "shipping_confirmation", "part_shipped", "order_cancelled", "order_refunded",
  "payment_link", "payment_link_reminder", "delivery_update", "carrier_delivery_update", "request_received", "payment_failed", "order_picked_up", "review_request"];
const listOrder = (id: string) => { const i = LIST_ORDER.indexOf(id); return i < 0 ? LIST_ORDER.length : i; };
/** The sample order's number, as the preview fills it. */
const SAMPLE_ORDER_ID = fillSample("order_confirmation", "{{order_id}}", {});

const WORD_FIELDS = ["subject", "body", "buttonText", "signoff"] as const;
/** Emails with no order behind them: they follow the shop's own language, not the shopper's (functions/emailFrench.js). */
const NO_ORDER_EMAILS = new Set<string>(["customer_welcome", "contact_reply", "abandoned_cart"]);
type WordField = typeof WORD_FIELDS[number];
/** Status and request words as a French email fills them (functions/emailFrench.js VALUES_FR). */
const FRENCH_SAMPLES = { status: "en cours de livraison", request: "retourner" };

/** The words shown and sent for `templateId` in `language`: the English template, or its French words over the French defaults. */
function wordsFor(templateId: TemplateKey, data: NotificationSettings, language: EmailLanguage, defaults = DEFAULT_SETTINGS): TemplateFields {
  const template = data[templateId] || defaults[templateId];
  const french = FRENCH_DEFAULTS[templateId];
  if (language !== "fr" || !french) return template;
  const saved = template.fr || {};
  const pick = (k: WordField) => (typeof saved[k] === "string" ? saved[k]! : french[k]);
  return { subject: pick("subject"), body: pick("body"), buttonText: pick("buttonText"), signoff: pick("signoff"), enabled: template.enabled };
}

function compilePreviewHtml(templateId: TemplateKey, data: NotificationSettings, order: any = null, shopName = DEFAULT_SHOP_NAME, defaults = DEFAULT_SETTINGS, language: EmailLanguage = "en") {
  const brand: Partial<NotificationSettings["brand"]> = data.brand || {};
  const brandColor = brand.brandColor || "#a9e8c6";
  const french = language === "fr" && !!FRENCH_DEFAULTS[templateId];
  const template = wordsFor(templateId, data, language, defaults);
  // Same rules as the server: empty fields fall back to the default, required lines come back,
  // unknown placeholders read as blank.
  const fallback = french ? FRENCH_DEFAULTS[templateId] : defaults[templateId];
  const body = withRequiredPlaceholders(templateId, template.body || fallback.body, french ? "fr" : "en");
  const values = { shop_name: shopName, ...orderPreviewVars(order), ...(french ? FRENCH_SAMPLES : {}) };
  const buttonText = fillSample(templateId, template.buttonText || "", values);
  const signoff = fillSample(templateId, template.signoff || fallback.signoff, values);
  // {{items_table}} survives filling so it lands where the owner put it, as the server does.
  const hasTable = (PLACEHOLDERS[templateId as keyof typeof PLACEHOLDERS] || []).includes("items_table");
  const placed = placeItemsTable(fillSample(templateId, body, hasTable ? { ...values, items_table: "{{items_table}}" } : values).replace(/\n/g, "<br/>"), hasTable ? previewItemsTable(order, brand.emailTheme, french ? "fr" : "en") : "");
  const finalBody = placed.body;

  const ctaButtonHtml = buttonText ? risoButton("#", buttonText, brandColor, brand.emailTheme) : "";

  const itemsTableHtml = placed.after;

  const signoffHtml = signoff.replace(/\n/g, "<br/>");

  return risoLayout(`
    <p style="margin-top:0;">${finalBody}</p>
    ${ctaButtonHtml}
    ${itemsTableHtml}
    <p style="margin-top:30px;font-weight:600;">${signoffHtml}</p>
  `, { logoUrl: brand.logoUrl || "", accent: brandColor, theme: brand.emailTheme, shopName });
}

export function NotificationEditor({ focus, subTab, onSubTabChange }: {
  focus?: "sender";
  /** The open sub tab when the Dashboard keeps it in the address bar (`#settings/notifications/deliveries`). */
  subTab?: string;
  onSubTabChange?: (id: string | undefined) => void;
} = {}) {
  const [data, setData] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  // The saved templates could not be read: showing defaults and saving them would overwrite everything.
  const [loadFailed, setLoadFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<TemplateKey>("order_confirmation");
  // Which words are being edited: the English email, or the French one sent to shoppers who ordered in French.
  const [language, setLanguage] = useState<EmailLanguage>("en");
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState("");
  // What the shop sells (plan 10.23): a shop that doesn't sell books gets its own default words, as the server sends.
  // Words still at the books default read as the shop's, also when the answer arrives after the templates loaded.
  const sells = useShopSells();
  const shopDefaults = useMemo(() => emailDefaultsFor(sells, DEFAULT_SETTINGS), [sells]);
  useEffect(() => {
    if (sellsBooks(sells) || loading) return;
    setData((prev) => withShopEmailWords(sells, prev, DEFAULT_SETTINGS));
    setOriginal((prev) => (prev ? JSON.stringify(withShopEmailWords(sells, JSON.parse(prev), DEFAULT_SETTINGS)) : prev));
  }, [sells, loading]);
  const [resendDraft, setResendDraft] = useState("");
  const [removingResend, setRemovingResend] = useState(false);
  // Settings › Email sender: the stored `communications` map and the three sender fields being edited.
  const [comms, setComms] = useState<Record<string, any> | null>(null);
  const [sender, setSender] = useState<Sender>({ fromName: "", replyTo: "", fromEmail: "" });
  const [senderSaved, setSenderSaved] = useState<Sender>({ fromName: "", replyTo: "", fromEmail: "" });
  // The name emails use when Sender name is empty: the shop's Site name, like the server (plan 5.8).
  const [shopNameDefault, setShopNameDefault] = useState(() => pressName(null));
  const [senderError, setSenderError] = useState("");
  const [savingSender, setSavingSender] = useState(false);
  const [group, setGroup] = useState<string>("orders");
  // The old Email sender address (focus "sender") opens on the tab holding the sender card.
  const [view, setView] = useSubTab<EmailView>(focus === "sender" ? "email-setup" : "email-templates", subTab, onSubTabChange);
  // On a platform shop the backup is the shared sender, so the shop's own Resend settings don't apply (plan 2.3b).
  const senderStatus = useSenderStatus();
  // A shop run by Colophon never meets the backup sender's account key, even before the server has answered (code plan 6.16).
  const sharedBackup = senderStatus.backup === "platform" || runsOnColophon();
  // "Preview with a real order": recent orders loaded on demand, filled in the browser only.
  const [recentOrders, setRecentOrders] = useState<any[] | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState("");
  const [deliveryLimit, setDeliveryLimit] = useState(50);
  const [deliveriesMore, setDeliveriesMore] = useState(false);
  // Emails sub page: the long placeholder list, the preview width and the "More" categories menu.
  const [allTokens, setAllTokens] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop");
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [moreOpen]);
  
  // Test Email states
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deliveries, setDeliveries] = useState<EmailLogEntry[] | null>(null);
  const [deliveriesError, setDeliveriesError] = useState("");
  const [queue, setQueue] = useState<QueuedEmail[]>([]);
  const [queueError, setQueueError] = useState(false);
  // Typed "Days after shipping" while editing, so clearing the box doesn't snap back to 14.
  const [delayDraft, setDelayDraft] = useState<string | null>(null);
  const [queueBusy, setQueueBusy] = useState("");
  // Where a placeholder chip inserts: the field the admin last clicked or typed in, at the caret.
  const [cursor, setCursor] = useState<{ field: "subject" | "body" | "signoff"; start: number | null; end: number | null }>({ field: "body", start: null, end: null });
  const [confirm, confirmNode] = useConfirm();
  const [resendWasPublic, setResendWasPublic] = useState(false);
  // A caret remembered on one email must not decide where a chip lands on another.
  useEffect(() => { setCursor({ field: "body", start: null, end: null }); }, [activeTab]);

  useEffect(() => {
    adminApi.getPublicSettings().then((st: any) => {
      const found = senderOf(st?.communications);
      setComms(st?.communications || {}); setSender(found); setSenderSaved(found); setShopNameDefault(pressName(st));
    }).catch(() => setSenderError("The saved sender details couldn't be loaded, so they can't be changed right now. Reload the page to try again."));
    loadSettings();
    loadDeliveries();
    loadQueue();
    // Default the test recipient to the signed-in admin so Send test works straight away.
    if (auth.currentUser?.email) setTestEmail((prev) => prev || auth.currentUser?.email || "");
  }, []);

  async function loadDeliveries(count = deliveryLimit) {
    try {
      const rows = await emailSenderData.readLog(count);
      setDeliveries(rows as EmailLogEntry[]);
      setDeliveriesMore(rows.length >= count);
      setDeliveriesError("");
    } catch (err: any) {
      console.warn("Could not load email delivery log:", err);
      setDeliveries([]);
      setDeliveriesError(err?.code === "permission-denied"
        ? "The delivery list isn't switched on for this shop yet (its security rules need updating). Emails still send."
        : "The delivery list couldn't be loaded. Check your connection, then try again.");
    }
  }

  async function loadQueue() {
    try {
      const data = await emailSenderData.call({ action: "emailQueue" });
      setQueue(Array.isArray(data.entries) ? data.entries : []);
      setQueueError(false);
    } catch (err) {
      // Don't hide the card silently: emails may be waiting. Recent deliveries still lists every attempt.
      console.warn("Could not load the email retry queue:", err);
      setQueue([]);
      setQueueError(true);
    }
  }

  async function retryQueued(entry: QueuedEmail) {
    setQueueBusy(entry.id);
    try {
      const result = await emailSenderData.call({ action: "retryEmail", id: entry.id });
      if (result.status === "sent") toast.success(`Sent to ${entry.to}.`);
      else toast.error(`Still not sent: ${result.error || "the sender refused it"}${result.status === "queued" ? " It will be tried again automatically." : ""}`);
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't retry this email"));
    } finally {
      setQueueBusy("");
      loadQueue();
      loadDeliveries();
    }
  }

  async function stopQueued(entry: QueuedEmail) {
    const ok = await confirm({ title: "Stop sending this email?", message: `“${entry.subject}” to ${entry.to} will be removed from the queue and never sent. This can't be undone.`, confirmLabel: "Stop sending" });
    if (!ok) return;
    setQueueBusy(entry.id);
    try {
      await emailSenderData.call({ action: "cancelEmail", id: entry.id });
      toast.success("Removed from the queue.");
    } catch (err: any) {
      toast.error(plainError(err, "Couldn't stop this email"));
    } finally {
      setQueueBusy("");
      loadQueue();
      loadDeliveries();
    }
  }

  async function loadSettings() {
    setLoadFailed(false);
    setLoading(true);
    try {
      const docRef = doc(db, "settings", "notifications");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const dbData = snap.data() as any;
        // Merge dbData with default settings to prevent issues with missing fields
        // Every template (and anything else saved, e.g. shop alerts) merged over its defaults.
        const loaded: any = { ...dbData, brand: { ...DEFAULT_SETTINGS.brand, ...(dbData.brand || {}) } };
        for (const id of TEMPLATE_IDS) loaded[id] = { ...DEFAULT_SETTINGS[id], ...(dbData[id] || {}) };
        // An older saved new_order_admin.enabled carries over until shopAlerts is saved.
        loaded.shopAlerts = {
          ...(dbData.shopAlerts || {}),
          newOrder: dbData.shopAlerts?.newOrder ?? (dbData.new_order_admin?.enabled !== false),
          shipped: dbData.shopAlerts?.shipped !== false,
        };
        if (dbData.brand?.resendApiKey || dbData.resendApiKey) {
          // Older saves left the key in the public doc: move it to adminSecrets now.
          // Blank the on-screen copy only once the move succeeded: otherwise the next Save would erase the only copy.
          try {
            await adminApi.saveNotificationSettings({ ...dbData, brand: { ...(dbData.brand || {}), resendApiKey: dbData.brand?.resendApiKey || dbData.resendApiKey } });
            loaded.brand.resendApiKey = "";
            await adminApi.markKeysMigrated("resend").catch(err => console.warn("Could not mark the Resend key as moved:", err));
          } catch (err) {
            console.warn("Could not move Resend key:", err);
            loaded.brand.resendApiKey = dbData.brand?.resendApiKey || dbData.resendApiKey;
            toast.error("Couldn't move your saved Resend key to the admin-only store. It has been kept; Save this page to try again."); // Own-account shops only: the mail service key is hidden on Colophon shops
          }
        }
        const flags = await adminApi.getPrivateKeyFlags();
        loaded.brand.resendApiKeyStored = flags.resend;
        setResendWasPublic(flags.resendMigrated);
        setData(loaded);
        setOriginal(JSON.stringify(loaded));
      } else {
        setOriginal(JSON.stringify(DEFAULT_SETTINGS));
        // Pre-fill general site settings logo if available
        try {
          const generalSnap = await getDoc(doc(db, "settings", "website"));
          if (generalSnap.exists()) {
            const generalData = generalSnap.data();
            const siteLogo = generalData.general?.logoUrl || "";
            setData(prev => ({
              ...prev,
              brand: {
                ...prev.brand,
                logoUrl: siteLogo
              }
            }));
          }
        } catch (err) {
          console.warn("Could not load logo default:", err);
        }
      }
    } catch (err) {
      console.error("Failed to load notifications settings:", err);
      setLoadFailed(true);
      toast.error("Your email templates couldn't be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (loadFailed) { toast.error("Your saved templates didn't load, so nothing can be saved. Reload them first."); return; }
    setSaving(true);
    try {
      await adminApi.saveNotificationSettings(data);
      setOriginal(JSON.stringify(data));
      setResendDraft("");
      toast.success("Notification templates saved");
    } catch (err: any) {
      console.error(err);
      toast.error(plainError(err, "Your email changes weren't saved. They are still on screen"));
    } finally {
      setSaving(false);
    }
  }

  const handleFieldChange = (field: keyof TemplateFields, val: any) => {
    setData(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: val
      }
    }));
  };

  // A word in the language being edited; the French words live beside the English ones, in `<template>.fr`.
  const handleWordChange = (field: WordField, val: string) => {
    if (editLanguage !== "fr") return handleFieldChange(field, val);
    setData(prev => ({ ...prev, [activeTab]: { ...prev[activeTab], fr: { ...(prev[activeTab]?.fr || {}), [field]: val } } }));
  };

  const handleToggleActive = () => {
    const isCurrentlyEnabled = activeTab === "review_request" ? currentTemplate.enabled === true : currentTemplate.enabled !== false;
    handleFieldChange("enabled", !isCurrentlyEnabled);
  };

  const handleBrandChange = (field: "logoUrl" | "brandColor" | "emailTheme" | "resendApiKey", val: string) => {
    setData(prev => ({
      ...prev,
      brand: {
        ...prev.brand,
        [field]: val
      }
    }));
  };

  // Send a test: the words on screen (saved or not) for `templateId`, with the email look, to the address typed.
  const sendTest = async (templateId: TemplateKey, language: EmailLanguage) => {
    if (!testEmail || !testEmail.includes("@")) {
      setTestResult({ ok: false, message: "Enter the email address the test should go to." });
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      const { subject, body, buttonText, signoff } = wordsFor(templateId, data, FRENCH_DEFAULTS[templateId] ? language : "en", shopDefaults);
      const { logoUrl, brandColor, emailTheme } = data.brand || ({} as NotificationSettings["brand"]);
      await emailSenderData.call({
        templateId,
        email: testEmail.trim(),
        template: { subject, body, buttonText, signoff },
        language: FRENCH_DEFAULTS[templateId] ? language : "en",
        brand: { logoUrl, brandColor, emailTheme },
      });
      setTestResult({ ok: true, message: `Sent to ${testEmail.trim()}. Check that inbox, and its spam folder.` });
      toast.success(`Test email sent to ${testEmail.trim()}`);
    } catch (err: any) {
      console.error("Test Email error:", err);
      setTestResult({ ok: false, message: plainError(err, "The test email wasn't sent") });
      toast.error("Test email was not sent.");
    } finally {
      setSendingTest(false);
      loadDeliveries();
    }
  };

  useSettingsDirty("notifications", !loading && !loadFailed && JSON.stringify(data) !== original);
  // Every hook runs before the early returns below: a hook after them crashes the page once loading ends.
  useEffect(() => {
    if (focus === "sender" && !loading) document.getElementById("email-sender")?.scrollIntoView({ block: "start" });
  }, [focus, loading]);
  if (loading) return <LoadingState label="Loading notification templates…" />;
  if (loadFailed) return <ErrorState title="Your email templates couldn't be loaded" description="Nothing has been changed. Saving is switched off until they load, so the defaults can't replace your saved emails." onRetry={() => { void loadSettings(); }} />;

  const currentTemplate = data[activeTab] || shopDefaults[activeTab];
  // Emails with no order behind them (welcome, contact reply, abandoned cart) have only English words.
  const hasFrench = !!FRENCH_DEFAULTS[activeTab];
  const editLanguage: EmailLanguage = hasFrench ? language : "en";
  const shownWords = wordsFor(activeTab, data, editLanguage, shopDefaults);
  const dirty = JSON.stringify(data) !== original;
  const groupTabs = TABS.filter((t) => t.group === group);
  const pickGroup = (g: string) => {
    setGroup(g);
    const first = TABS.find((t) => t.group === g);
    if (first) setActiveTab(first.id);
    if (!testEmail && auth.currentUser?.email) setTestEmail(auth.currentUser.email);
  };
  // Every template is checked, so a problem on a tab you aren't looking at still shows.
  const allProblems = problemTemplates(Object.fromEntries(TEMPLATE_IDS.map((id) => [id, data[id]])));
  const problemLabels = Object.keys(allProblems).map((id) => TABS.find((t) => t.id === id)?.label || id);
  const groupProblemCount = (g: string) => TABS.filter((t) => t.group === g && allProblems[t.id]).length;
  const previewOrder = (recentOrders || []).find((o) => o.id === previewOrderId) || null;
  const loadRecentOrders = async () => {
    if (recentOrders) return;
    try { setRecentOrders((await adminApi.getOrders(20)) || []); } catch { setRecentOrders([]); toast.error("Couldn't load recent orders."); }
  };
  const shopAlerts: Partial<NotificationSettings["shopAlerts"]> = data.shopAlerts || {};
  const setShopAlert = (patch: Record<string, unknown>) => setData((prev) => ({ ...prev, ...patch }));
  const enabled = activeTab === "review_request" ? currentTemplate.enabled === true : currentTemplate.enabled !== false;
  // The shop name in the preview: the saved sender name, which the server reads first (loadNotificationSettings).
  const previewShopName = (senderSaved.fromName || "").trim() || shopNameDefault;
  const subjectPreview = fillSample(activeTab, shownWords.subject || (editLanguage === "fr" ? FRENCH_DEFAULTS[activeTab].subject : shopDefaults[activeTab].subject), { shop_name: previewShopName, ...orderPreviewVars((recentOrders || []).find((o) => o.id === previewOrderId)), ...(editLanguage === "fr" ? FRENCH_SAMPLES : {}) });
  const badColor = !!data.brand?.brandColor && !/^#[0-9a-f]{3,8}$/i.test(data.brand.brandColor.trim());
  // The English words were changed but the French ones never were: French shoppers would miss what was added.
  const englishWords = wordsFor(activeTab, data, "en", shopDefaults);
  const frenchUntouched = hasFrench && !WORD_FIELDS.some((k) => typeof currentTemplate.fr?.[k] === "string");
  const englishChanged = WORD_FIELDS.some((k) => (englishWords[k] || "") !== (shopDefaults[activeTab][k] || ""));
  const problems = [
    ...templateProblems(activeTab, shownWords, editLanguage),
    ...(editLanguage === "en" && frenchUntouched && englishChanged
      ? [{ tone: "warning" as const, text: "The French version still has the default words. Add anything new on the French tab too." }]
      : []),
  ];
  const defaults = editLanguage === "fr" ? FRENCH_DEFAULTS[activeTab] : shopDefaults[activeTab];
  const isDefault = WORD_FIELDS.every((k) => (shownWords[k] || "") === (defaults[k] || ""));
  const resetTemplate = async () => {
    const label = TABS.find((t) => t.id === activeTab)?.label || "this email";
    if (!(await confirm({ title: `Reset ${label} to the default words?`, message: `Your ${editLanguage === "fr" ? "French" : "English"} words for this email go back to the default. Nothing is saved until you choose Save.`, confirmLabel: "Reset" }))) return;
    // Resetting one language leaves the other language's words as they are.
    setData((prev) => {
      const { fr, ...english } = prev[activeTab] || ({} as TemplateFields);
      const next = editLanguage === "fr" ? english : { ...shopDefaults[activeTab], ...(fr ? { fr } : {}) };
      return { ...prev, [activeTab]: { ...next, enabled: prev[activeTab]?.enabled } };
    });
    toast.success("Default words back. Save to keep them.");
  };
  const remember = (field: "subject" | "body" | "signoff") => (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCursor({ field, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd });
  const addPlaceholder = (name: string) => {
    const token = `{{${name}}}`;
    // The order table is HTML: it only goes in the body (at the caret if the body was last used).
    const field = name === "items_table" ? "body" : cursor.field;
    const at = field === cursor.field ? cursor : { start: null, end: null };
    const next = insertAt(shownWords[field] || "", token, at.start, at.end);
    handleWordChange(field, next.value);
    setCursor({ field, start: next.caret, end: next.caret });
    toast.success(`Added ${token} to the ${field === "body" ? "body copy" : field === "subject" ? "subject line" : "sign-off"}.`);
  };

  const senderIssues = senderProblems(sender);
  const senderDirty = JSON.stringify(sender) !== JSON.stringify(senderSaved);
  async function saveSender() {
    if (comms === null || Object.keys(senderIssues).length) return;
    setSavingSender(true);
    try {
      const next = withSender(comms, sender);
      await adminApi.updateSettings({ communications: next });
      const saved = senderOf(next);
      setComms(next); setSender(saved); setSenderSaved(saved); setSenderError("");
      toast.success("Email sender saved");
    } catch (err: any) {
      toast.error(plainError(err, "The email sender wasn't saved"));
    } finally {
      setSavingSender(false);
    }
  }

  async function removeResendKey() {
    if (!(await confirm({ title: "Remove the stored Resend key?", message: "The backup sender will use the RESEND_API_KEY set in Firebase Functions (if any) until you enter a new key.", confirmLabel: "Remove key" }))) return; // Own-account shops only: the mail service key is hidden on Colophon shops
    setRemovingResend(true);
    try {
      await adminApi.removeResendKey();
      const clear = (text: string) => { try { const o = JSON.parse(text); o.brand = { ...(o.brand || {}), resendApiKeyStored: false, resendApiKey: "" }; return JSON.stringify(o); } catch { return text; } };
      setData(prev => ({ ...prev, brand: { ...prev.brand, resendApiKeyStored: false, resendApiKey: "" } }));
      setOriginal(clear);
      setResendDraft("");
      toast.success("Stored Resend key removed"); // Own-account shops only: the mail service key is hidden on Colophon shops
    } catch (err: any) {
      toast.error(plainError(err, "The key wasn't removed")); // Own-account shops only: the mail service key is hidden on Colophon shops
    } finally {
      setRemovingResend(false);
    }
  }
  const resendStored = !!(data.brand?.resendApiKey || data.brand?.resendApiKeyStored);

  // Sub tabs: Emails (templates and shop alerts), Sending setup, Deliveries. All stay mounted, so one Save bar covers
  // template and branding edits whichever tab they were made on.
  const savedData = (() => { try { return JSON.parse(original); } catch { return {}; } })();
  const brandDirty = JSON.stringify(data.brand || {}) !== JSON.stringify(savedData.brand || {});
  const templatesDirty = JSON.stringify({ ...data, brand: null }) !== JSON.stringify({ ...savedData, brand: null });
  const waitingCount = queue.filter((q) => q.status === "pending").length;
  const gaveUpCount = queue.length - waitingCount;
  const pausedCount = TEMPLATE_IDS.filter((id) => (id === "review_request" ? data[id]?.enabled !== true : data[id]?.enabled === false)).length;

  const stats = deliveryStats(deliveries || []);
  const problemCount = Object.keys(allProblems).length;
  const method = sendMethod({ shared: sharedBackup, gmailAddress: senderStatus.gmailAddress, lastKeySource: currentRows(deliveries || []).find((r) => r.status === "sent")?.keySource });
  const moreGroups = GROUP_IDS.filter((g) => !MAIN_GROUPS.includes(g));
  const groupLabel = (g: string) => GROUP_LABELS[g] || (g === "shopAlerts" ? "Shop alerts" : g);
  const listed = [...groupTabs].sort((a, b) => listOrder(a.id) - listOrder(b.id));
  const templateLabel = TABS.find((t) => t.id === activeTab)?.label || "Email";
  const tokens = PLACEHOLDERS[activeTab as keyof typeof PLACEHOLDERS] || [];
  const shownTokens = allTokens ? tokens : tokens.slice(0, 4);
  const setupSubject = fillSample("order_confirmation", wordsFor("order_confirmation", data, "en", shopDefaults).subject || shopDefaults.order_confirmation.subject, { shop_name: previewShopName, ...orderPreviewVars(null) });
  const isOn = (id: TemplateKey) => (id === "review_request" ? data[id]?.enabled === true : data[id]?.enabled !== false);

  return (
    <div className="es-page">
      <div className="es-head">
        <Tabs<EmailView> variant="page" label="Emails" value={view} onChange={setView} tabs={[
          { id: "email-templates", label: "Emails", unsaved: templatesDirty, ...(problemCount ? { count: problemCount } : {}) },
          { id: "email-setup", label: "Sending setup", unsaved: brandDirty || senderDirty },
          { id: "email-deliveries", label: "Deliveries", ...(stats.problems ? { count: stats.problems } : {}) },
        ]} />
        {view === "email-templates" && (
          <div className="es-chips" aria-label="Emails at a glance" role="group">
            {queueError ? <span className="es-chip" data-tone="warn">Couldn't check the send queue</span>
              : queue.length ? <button type="button" className="es-chip" data-tone={gaveUpCount ? "problem" : "warn"} onClick={() => setView("email-deliveries")}>{gaveUpCount ? `${gaveUpCount} not sent` : `${waitingCount} waiting to send`}</button>
              : <span className="es-chip" data-tone="good">Nothing waiting</span>}
            {deliveries !== null && !deliveriesError && stats.problems > 0 && <button type="button" className="es-chip" data-tone="problem" onClick={() => setView("email-deliveries")}>{stats.problems} delivery problem{stats.problems === 1 ? "" : "s"}</button>}
            {problemCount > 0 && <span className="es-chip" data-tone="warn">{problemCount} email{problemCount === 1 ? "" : "s"} to check</span>}
            {pausedCount > 0 && <span className="es-chip">{pausedCount} email{pausedCount === 1 ? "" : "s"} off</span>}
          </div>
        )}
      </div>

      <TabPanel tabId="email-templates" active={view === "email-templates"}>
        <div className="es-emails" data-alerts={group === "shopAlerts" || undefined}>
          <nav className="es-card es-list" aria-label="Emails your shop sends">
            <div className="es-pills" role="group" aria-label="Kind of email">
              {MAIN_GROUPS.filter((g) => GROUP_IDS.includes(g)).map((g) => (
                <button key={g} type="button" className="es-pill" aria-pressed={group === g} onClick={() => pickGroup(g)}>
                  {groupLabel(g)}{groupProblemCount(g) ? <span className="es-count" aria-label={`${groupProblemCount(g)} to check`}> ⚠</span> : null}
                </button>
              ))}
              {moreGroups.length > 0 && (
                <div className="es-more" ref={moreRef}>
                  <button type="button" className="es-pill" aria-haspopup="true" aria-expanded={moreOpen || moreGroups.includes(group)}
                    onClick={() => setMoreOpen((o) => !o)}>{moreGroups.includes(group) ? groupLabel(group) : "More"} <span aria-hidden="true">▾</span></button>
                  {moreOpen && (
                    <div className="es-menu" role="menu">
                      {moreGroups.map((g) => (
                        <button key={g} type="button" role="menuitem" aria-current={group === g || undefined} onClick={() => { pickGroup(g); setMoreOpen(false); }}>
                          {groupLabel(g)}{groupProblemCount(g) ? <span className="es-tag" data-tone="problem">Check</span> : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {group === "shopAlerts" ? (
              <p className="es-hint" style={{ padding: "8px 12px" }}>Emails to you, not your customers.</p>
            ) : (
              <ul className="es-rows">
                {listed.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="es-msg" aria-current={activeTab === t.id || undefined} onClick={() => setActiveTab(t.id)}>
                      <span className="es-dot" data-on={isOn(t.id) || undefined} aria-hidden="true" />
                      <span>{t.label}{!isOn(t.id) && <span className="rp-sr-only"> (off)</span>}</span>
                      {allProblems[t.id] ? <span className="es-tag" data-tone="problem">Check</span> : !isOn(t.id) ? <span className="es-tag" aria-hidden="true">Off</span> : <span />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          {group === "shopAlerts" ? (
            <section className="es-card es-editor" aria-labelledby="es-alerts-title">
              <div className="es-editor-head"><h2 className="es-title" id="es-alerts-title">Shop alerts</h2></div>
              <div className="rp-stack" style={{ gap: 16 }}>
                <Toggle label="New order alerts — a paid order, or an order waiting for a manual payment" checked={shopAlerts.newOrder !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, newOrder: on } })} />
                <p className="es-hint">Subject “[NEW ORDER] …”, fixed so filters keep working.</p>
                <Toggle label="Shipped copy — a copy of each order you mark as shipped" checked={shopAlerts.shipped !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, shipped: on } })} />
                <Toggle label="Daily “orders needing you” email (8am)" checked={shopAlerts.dailyOrderDigest !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, dailyOrderDigest: on } })} />
                <p className="es-hint">Late orders, stuck parcels, odd labels. Silent on quiet days.</p>
                <Toggle label="Running low — products that reach your low-stock line (in the 8am email)" checked={shopAlerts.lowStock !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, lowStock: on } })} />
                <p className="es-hint">Once per item, again if it sells out. Set the line in Inventory.</p>
                <Toggle label="Social post didn't go out — a scheduled post that Facebook, Instagram, Pinterest or TikTok refused" checked={shopAlerts.socialPostFailed !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, socialPostFailed: on } })} />
                <Toggle label="Monday summary — last week's sales and visits, with a PDF of the highlights (Mondays, 8am)" checked={shopAlerts.weeklySummary !== false}
                  onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, weeklySummary: on } })} />
                <p className="es-hint">Sales, visits and best sellers vs last week.</p>
                <WeeklySummaryNow />
                {combinedAdmin() && (
                  <>
                    <Toggle label="Fair day summary — the day's takings at the Till and what sold (evenings, 9pm)" checked={shopAlerts.fairDaySummary !== false}
                      onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, fairDaySummary: on } })} />
                    <p className="es-hint">Only on a day the Till sold something.</p>
                    <FairDaySummaryNow />
                  </>
                )}
              </div>
              <div className="es-foot">
                <div className="es-row">
                  <PrimaryButton onClick={handleSave} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save" : "Saved"}</PrimaryButton>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="es-card es-editor" aria-labelledby="es-editor-title">
                <div className="es-editor-head">
                  <h2 className="es-title" id="es-editor-title">{templateLabel}</h2>
                  <span className="es-auto">
                    <span id="es-auto-label">Send automatically</span>
                    <button type="button" role="switch" className="es-switch" aria-checked={enabled} aria-labelledby="es-auto-label" onClick={() => handleToggleActive()} />
                  </span>
                </div>
                {activeTab === "review_request" && (
                  <TextField label="Days after shipping" type="number" min={1} max={90}
                    value={delayDraft ?? String((currentTemplate as any).delayDays ?? 14)}
                    hint="1 to 90 days."
                    onChange={(e) => {
                      const v = e.target.value;
                      setDelayDraft(v);
                      const n = Number(v);
                      if (v.trim() !== "" && Number.isFinite(n) && n >= 1 && n <= 90) handleFieldChange("delayDays" as any, Math.round(n) as any);
                    }}
                    onBlur={() => {
                      if (delayDraft !== null) {
                        const n = Number(delayDraft);
                        // Empty or invalid keeps the last good value; numbers out of range are clamped.
                        if (delayDraft.trim() !== "" && Number.isFinite(n)) handleFieldChange("delayDays" as any, Math.min(90, Math.max(1, Math.round(n))) as any);
                      }
                      setDelayDraft(null);
                    }} />
                )}
                {hasFrench && (
                  <div className="es-lang">
                    <Tabs label="Language of this email" idPrefix="lang-" variant="page" value={editLanguage} onChange={(id) => setLanguage(id as EmailLanguage)}
                      tabs={[{ id: "en", label: "English" }, { id: "fr", label: "French" }]} />
                    <p className="es-hint">
                      {NO_ORDER_EMAILS.has(activeTab)
                        ? (editLanguage === "fr" ? "Used when your shop is in French." : "Sent in French when your shop is in French.")
                        : (editLanguage === "fr" ? "For shoppers who shop in French." : "French shoppers get the French version.")}
                    </p>
                  </div>
                )}
                <TextField label="Subject" value={shownWords.subject} placeholder="Subject line" onSelect={remember("subject")} onChange={(e) => handleWordChange("subject", e.target.value)} />
                <TextArea label="Body" rows={6} value={shownWords.body} placeholder="Write your email here…" onSelect={remember("body")} onChange={(e) => handleWordChange("body", e.target.value)} />
                <div className="es-two">
                  <TextField label="Button" value={shownWords.buttonText} placeholder="No button" hint="Blank hides the button." onChange={(e) => handleWordChange("buttonText", e.target.value)} />
                  <TextArea label="Sign-off" rows={2} value={shownWords.signoff} placeholder="Thanks," style={{ minHeight: 48 }} onSelect={remember("signoff")} onChange={(e) => handleWordChange("signoff", e.target.value)} />
                </div>
                {tokens.length > 0 && (
                  <div className="es-insert" role="group" aria-label="Insert a detail at your cursor">
                    <span className="es-insert-label">Insert</span>
                    {shownTokens.map((name) => (
                      <button key={name} type="button" className="es-token" title={`Insert {{${name}}}`} aria-label={`Insert ${name.replace(/_/g, " ")}`}
                        onMouseDown={(e) => e.preventDefault()} onClick={() => addPlaceholder(name)}>{name}</button>
                    ))}
                    {tokens.length > 4 && (
                      <button type="button" className="es-token" data-more aria-expanded={allTokens} onClick={() => setAllTokens((v) => !v)}>
                        {allTokens ? "Fewer" : `+${tokens.length - 4} more`}
                      </button>
                    )}
                  </div>
                )}
                {problems.length > 0 && (
                  <div role="status" className="rp-stack" style={{ gap: 8 }}>
                    {problems.map((p) => <p key={p.text} className="es-note" data-tone={p.tone === "danger" ? "problem" : "warn"}>{p.text}</p>)}
                  </div>
                )}
                <div className="es-foot">
                  <form className="es-row" onSubmit={(e) => { e.preventDefault(); void sendTest(activeTab, editLanguage); }}>
                    <div className="es-test">
                      <label htmlFor="es-test-to">Test to:</label>
                      <input id="es-test-to" type="email" value={testEmail} placeholder="you@yourpress.example" onChange={(e) => setTestEmail(e.target.value)} />
                    </div>
                    <SecondaryButton type="submit" className="es-outline" disabled={sendingTest}>{sendingTest ? "Sending…" : "Send test"}</SecondaryButton>
                  </form>
                  {testResult && view === "email-templates" && <p className="es-note" data-tone={testResult.ok ? "good" : "problem"} role="status">{testResult.message}</p>}
                  <div className="es-row">
                    <PrimaryButton onClick={handleSave} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save" : "Saved"}</PrimaryButton>
                    {dirty && <GhostButton onClick={() => { setData(JSON.parse(original)); setResendDraft(""); }}>Discard</GhostButton>}
                    {!isDefault && <GhostButton onClick={() => { void resetTemplate(); }}>Reset to default</GhostButton>}
                    {problemLabels.length > 0 && <span className="es-hint">Check: {problemLabels.join(", ")}</span>}
                  </div>
                </div>
              </section>

              <section className="es-card es-preview" aria-labelledby="es-preview-title">
                <div className="es-card-head" style={{ margin: 0 }}>
                  <h3 className="es-card-title" id="es-preview-title">Live preview</h3>
                  <div className="es-pills" role="radiogroup" aria-label="Preview width">
                    {(["desktop", "phone"] as const).map((m) => (
                      <button key={m} type="button" role="radio" className="es-pill" aria-checked={previewMode === m} onClick={() => setPreviewMode(m)}>{m === "desktop" ? "Desktop" : "Phone"}</button>
                    ))}
                  </div>
                </div>
                <select className="es-select" aria-label="Preview with" value={previewOrderId} onFocus={loadRecentOrders} onMouseEnter={loadRecentOrders} onChange={(e) => setPreviewOrderId(e.target.value)}>
                  <option value="">Sample order{SAMPLE_ORDER_ID ? ` · ${SAMPLE_ORDER_ID}` : ""}</option>
                  {(recentOrders || []).map((o) => <option key={o.id} value={o.id}>{o.orderId || o.id} · {o.customer?.name || o.customer?.email || "Customer"}</option>)}
                </select>
                <p className="es-subject"><span className="rp-sr-only">Subject: </span>{subjectPreview}</p>
                <div className="es-well" data-mode={previewMode}>
                  <iframe srcDoc={compilePreviewHtml(activeTab, data, previewOrder, previewShopName, shopDefaults, editLanguage)} sandbox="" title={`Preview of the ${templateLabel} email`} />
                </div>
                <p className="es-hint">{previewOrder ? "A real order's details. Nothing is sent." : "Sample details. Nothing is sent."}</p>
              </section>
            </>
          )}
        </div>
      </TabPanel>

      <TabPanel tabId="email-setup" active={view === "email-setup"}>
        <EmailSendingSetup method={method} shared={sharedBackup} gmailAddress={senderStatus.gmailAddress} deliveries={deliveries}
          sender={sender} setSender={setSender} senderIssues={senderIssues} shopNameDefault={shopNameDefault}
          senderDirty={senderDirty} savingSender={savingSender} senderReady={comms !== null} senderError={senderError} onSaveSender={() => { void saveSender(); }}
          brand={data.brand || {}} onBrand={handleBrandChange} badColor={badColor} lookDirty={brandDirty} savingLook={saving} onSaveLook={() => { void handleSave(); }}
          subjectSample={setupSubject}
          testEmail={testEmail} setTestEmail={setTestEmail} sendingTest={sendingTest} testResult={view === "email-setup" ? testResult : null}
          onSendTest={() => { void sendTest("order_confirmation", "en"); }}
          gmailCard={sharedBackup ? undefined : <GmailSendingCard lastProblem={lastGmailProblem(deliveries || [])} sender={senderStatus} />}
          backup={sharedBackup ? undefined : (
            <details style={{ marginTop: 16 }}>
              <summary className="rp-label" style={{ cursor: "pointer" }}>Advanced: backup sender (Resend){resendStored ? " · key stored" : ""}</summary>
              <p className="es-hint" style={{ margin: "8px 0" }}>Backup if Gmail fails. Reaches only you without a verified domain.</p>
              <TextField label="Resend API key" type="password" value={resendDraft} autoComplete="new-password" spellCheck={false}
                placeholder={resendStored ? "Stored — enter a new key to replace it" : "re_…"}
                error={resendKeyProblem(resendDraft) || undefined}
                hint={resendStored ? "✓ A key is stored. It is never shown here." : "Optional if the RESEND_API_KEY Functions secret is set."}
                onChange={(e) => {
                  const value = e.target.value;
                  setResendDraft(value);
                  // A key that fails the check is never passed up to be saved.
                  handleBrandChange("resendApiKey", resendKeyProblem(value) ? "" : value.trim());
                }} />
              {data.brand?.resendApiKeyStored && (
                <GhostButton size="sm" style={{ marginTop: 6 }} disabled={removingResend} onClick={removeResendKey}>
                  {removingResend ? "Removing…" : "Remove stored key"}
                </GhostButton>
              )}
              {resendStored && resendWasPublic && (
                <p className="es-note" data-tone="warn" style={{ marginTop: 12 }}>
                  This key was once saved where your website could read it and has been moved to the admin-only store. Rotate it in Resend to be safe.
                </p>
              )}
            </details>
          )} />
      </TabPanel>

      <TabPanel tabId="email-deliveries" active={view === "email-deliveries"}>
        <EmailDeliveries deliveries={deliveries} error={deliveriesError} more={deliveriesMore}
          onMore={() => { const next = deliveryLimit + 50; setDeliveryLimit(next); void loadDeliveries(next); }}
          queue={queue} queueError={queueError} busy={queueBusy}
          onRetry={(entry) => { void retryQueued(entry); }} onStop={(entry) => { void stopQueued(entry); }}
          onRefresh={() => { void loadDeliveries(); void loadQueue(); }} onOpenSetup={() => setView("email-setup")} />
      </TabPanel>

      {/* The Emails page has its own Save; the bar keeps a look or alert edit from being lost on the other pages. */}
      {view !== "email-templates" && (
        <SaveBar dirty={dirty} saving={saving} onSave={handleSave}
          onDiscard={() => { setData(JSON.parse(original)); setResendDraft(""); }}
          message={problemLabels.length ? `Unsaved email changes. Check: ${problemLabels.join(", ")}.` : "You have unsaved email changes."} />
      )}
      {confirmNode}
    </div>
  );
}

/** Settings › Email sender › Shop alerts › Send me today's fair summary now (the evening email, on demand). */
function FairDaySummaryNow() {
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      const answer = await emailFunction({ action: "fairDaySummaryNow" }) as { sent?: boolean; reason?: string } | undefined;
      if (answer && answer.sent === false) {
        toast(answer.reason === "no-stockroom" ? "The stockroom isn't set up in this shop yet, so there's nothing to send." : "The Till hasn't uploaded any sales today, so there's nothing to send yet.");
      } else {
        toast.success("Today's fair summary is on its way to owner@example.com");
      }
    } catch (err: any) {
      toast.error(plainError(err, "The fair summary wasn't sent"));
    } finally {
      setSending(false);
    }
  };
  return (
    <div>
      <SecondaryButton size="sm" onClick={send} disabled={sending}>{sending ? "Sending…" : "Send me today's fair summary now"}</SecondaryButton>
    </div>
  );
}

/** Settings › Email sender › Shop alerts › Send me last week's summary now (the Monday email, on demand). */
function WeeklySummaryNow() {
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      await emailFunction({ action: "weeklySummaryNow" });
      toast.success("Last week's summary is on its way to owner@example.com");
    } catch (err: any) {
      toast.error(plainError(err, "The summary wasn't sent"));
    } finally {
      setSending(false);
    }
  };
  return (
    <div>
      <SecondaryButton size="sm" onClick={send} disabled={sending}>{sending ? "Sending…" : "Send me last week's summary now"}</SecondaryButton>
    </div>
  );
}
