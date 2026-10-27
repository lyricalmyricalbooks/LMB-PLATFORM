import { useState, useEffect, type ReactNode, type SyntheticEvent } from "react";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import toast from "react-hot-toast";
import { placeItemsTable, risoButton, risoLayout, safeLogoUrl } from "./emailTheme";
import { orderPreviewVars, previewItemsTable } from "./emailPreviewData";
import { GmailSendingCard } from "./GmailSendingCard";
import { currentRows, emailLogBadge, emailLogDetail, needsAttention } from "./emailLogDisplay";
import { fillSample, insertAt, PLACEHOLDERS, problemTemplates, templateProblems, withRequiredPlaceholders, type TemplateFields } from "./emailTemplateChecks";
import { adminApi } from "./api";
import { useSettingsDirty } from "./settingsDirty";
import { resendKeyProblem } from "./privateKeys";
import { senderOf, senderProblems, withSender, type Sender } from "./senderSettings";
import { emailFunction, lastGmailProblem } from "./notificationApi";
import { plainError } from "./plainError";
import { useSubTab } from "./settingsLayout";
import {
  DataTable, ErrorState, GhostButton, PrimaryButton, LoadingState, SaveBar, SectionCard, SecondaryButton, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm,
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

/** One email in the server's retry queue (Settings › Notifications › Waiting to send). Never its HTML. */
type QueuedEmail = {
  id: string;
  to: string;
  subject: string;
  kind: string;
  status: "pending" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string;
  createdAt: string | null;
};

const MAX_TRIES = 8;


type NotificationSettings = {
  brand: {
    logoUrl: string;
    brandColor: string;
    emailTheme?: "light" | "dark";
    resendApiKey?: string;
    resendApiKeyStored?: boolean;
  };
  order_confirmation: TemplateFields;
  order_pending_payment: TemplateFields;
  shipping_confirmation: TemplateFields;
  abandoned_cart: TemplateFields;
  order_cancelled: TemplateFields;
  order_refunded: TemplateFields;
  customer_welcome: TemplateFields;
  delivery_update: TemplateFields;
  contact_reply: TemplateFields;
  gift_card: TemplateFields;
  /** Off unless switched on (server checks enabled === true); sent delayDays after shipping. */
  review_request: TemplateFields & { delayDays?: number };
  /** Older saved switch for the shop's new-order email; read only as shopAlerts.newOrder's fallback. */
  new_order_admin?: { enabled?: boolean };
  /** Emails to the shop itself; on unless switched off. */
  shopAlerts: { newOrder: boolean; shipped: boolean; dailyOrderDigest?: boolean; weeklySummary?: boolean };
};

type TemplateKey = Exclude<keyof NotificationSettings, "brand" | "new_order_admin" | "shopAlerts">;

const DEFAULT_SETTINGS: NotificationSettings = {
  brand: {
    logoUrl: "",
    brandColor: "#e8402a",
    emailTheme: "light",
    resendApiKey: ""
  },
  order_confirmation: {
    subject: "Order confirmed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your purchase! We've received your order and are preparing it for shipment. We will send you another email when it has shipped.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_pending_payment: {
    subject: "Order received — payment needed: {{order_id}}",
    body: "Hi {{customer_name}},\n\nThank you for your order! It is reserved for you, but it is not paid yet. Please pay {{total_price}} by {{payment_method}} using the instructions below. We'll confirm by email as soon as your payment arrives and then prepare your order.",
    buttonText: "View your order",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  shipping_confirmation: {
    subject: "Your order is on the way!",
    body: "Hi {{customer_name}},\n\nGood news! Your order {{order_id}} has shipped with {{tracking_carrier}} and is on its way.\n\nTracking number: {{tracking_number}}\n\nUse the button below to follow your parcel on the carrier's website.",
    buttonText: "Track your shipment",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  abandoned_cart: {
    subject: "Did you forget something?",
    body: "Hi {{customer_name}},\n\nWe noticed you left some items in your cart. We've saved them for you, so you can easily complete your purchase whenever you're ready!",
    buttonText: "Resume purchase",
    signoff: "Thanks,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_cancelled: {
    subject: "Order cancelled: {{order_id}}",
    body: "Hi {{customer_name}},\n\nYour order has been cancelled and you will not be charged. If you have any questions, please contact us.",
    buttonText: "",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  order_refunded: {
    subject: "Order refunded: {{order_id}}",
    body: "Hi {{customer_name}},\n\nWe have successfully refunded {{total_price}} for your order. The funds should return to your original payment method in 5-10 business days.",
    buttonText: "",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  customer_welcome: {
    subject: "Welcome to Lyricalmyrical Books!",
    body: "Hi {{customer_name}},\n\nThank you for creating an account with Lyricalmyrical Books! You can now log in to view your orders, save shipping addresses, and download digital library books.",
    buttonText: "Go to your account",
    signoff: "Warmly,\nThe Lyricalmyrical Team",
    enabled: true
  },
  contact_reply: {
    subject: "We got your message",
    body: "Hi {{customer_name}},\n\nThanks for getting in touch with Lyricalmyrical Books! We've received your message and will reply as soon as we can.",
    buttonText: "",
    signoff: "Warmly,\nThe Lyricalmyrical Team",
    enabled: true
  },
  gift_card: {
    subject: "You've received a {{amount}} gift card",
    body: "Hi {{recipient_name}},\n\n{{sender_name}} sent you a {{amount}} gift card for Lyricalmyrical Books.\n\n{{message}}\n\nYour gift card code: {{code}}\n\nEnter this code at checkout to use it. Any balance left over stays on the card for next time. {{expires}}",
    buttonText: "Shop now",
    signoff: "Happy reading,\nThe Lyricalmyrical Team",
    enabled: true
  },
  delivery_update: {
    subject: "Delivery Update: Your order is {{status}}",
    body: "Hi {{customer_name}},\n\nYour package tracking status has been updated: {{status}}.\n\nCarrier: {{tracking_carrier}}\nTracking: {{tracking_number}}",
    buttonText: "Track shipment",
    signoff: "Best,\nThe Lyricalmyrical Team",
    enabled: true
  },
  // Mirrors functions/reviewRequests.js REVIEW_REQUEST_TEMPLATE.
  review_request: {
    subject: "How are you finding your book?",
    body: "Hi {{customer_name}},\n\nWe hope your books from order {{order_id}} arrived safely. If you have a moment, we'd love to hear what you think — a short review helps other readers find their next book. Each title below opens its page, where the review form is.",
    buttonText: "Write a review",
    signoff: "Thanks for reading,\nThe Lyricalmyrical Team",
    enabled: false,
    delayDays: 14
  },
  shopAlerts: { newOrder: true, shipped: true, dailyOrderDigest: true, weeklySummary: true }
};

// Every customer email the editor shows. A template added to DEFAULT_SETTINGS appears
// automatically (under its TAB_META group, else "Other").
const TAB_META: Record<string, { label: string; group: string }> = {
  order_confirmation: { label: "Order Paid", group: "orders" },
  order_pending_payment: { label: "Awaiting Payment", group: "orders" },
  shipping_confirmation: { label: "Order Shipped", group: "orders" },
  delivery_update: { label: "Delivery", group: "orders" },
  order_cancelled: { label: "Order Cancelled", group: "orders" },
  order_refunded: { label: "Order Refunded", group: "orders" },
  review_request: { label: "Review request", group: "orders" },
  abandoned_cart: { label: "Abandoned Cart", group: "cart" },
  customer_welcome: { label: "Welcome", group: "account" },
  contact_reply: { label: "Message received", group: "contact" },
  gift_card: { label: "Gift card", group: "giftCards" },
};
const GROUP_LABELS: Record<string, string> = { orders: "Orders", cart: "Cart", account: "Account", contact: "Contact form", giftCards: "Gift cards", other: "Other" };
const TEMPLATE_IDS = Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "brand" && k !== "new_order_admin" && k !== "shopAlerts") as TemplateKey[];
const TABS = TEMPLATE_IDS.map((id) => ({ id, label: TAB_META[id]?.label || id.replace(/_/g, " "), group: TAB_META[id]?.group || "other" }));
const GROUP_IDS = [...Object.keys(GROUP_LABELS).filter((g) => TABS.some((t) => t.group === g)), "shopAlerts"];

function compilePreviewHtml(templateId: TemplateKey, data: NotificationSettings, order: any = null) {
  const brand: Partial<NotificationSettings["brand"]> = data.brand || {};
  const brandColor = brand.brandColor || "#e8402a";
  
  const template = data[templateId] || DEFAULT_SETTINGS[templateId];
  // Same rules as the server: empty fields fall back to the default, required lines come back,
  // unknown placeholders read as blank.
  const fallback = DEFAULT_SETTINGS[templateId];
  const body = withRequiredPlaceholders(templateId, template.body || fallback.body);
  const values = orderPreviewVars(order);
  const buttonText = fillSample(templateId, template.buttonText || "", values);
  const signoff = fillSample(templateId, template.signoff || fallback.signoff, values);
  // {{items_table}} survives filling so it lands where the owner put it, as the server does.
  const hasTable = (PLACEHOLDERS[templateId as keyof typeof PLACEHOLDERS] || []).includes("items_table");
  const placed = placeItemsTable(fillSample(templateId, body, hasTable ? { ...values, items_table: "{{items_table}}" } : values).replace(/\n/g, "<br/>"), hasTable ? previewItemsTable(order, brand.emailTheme) : "");
  const finalBody = placed.body;

  const ctaButtonHtml = buttonText ? risoButton("#", buttonText, brandColor, brand.emailTheme) : "";

  const itemsTableHtml = placed.after;

  const signoffHtml = signoff.replace(/\n/g, "<br/>");

  return risoLayout(`
    <p style="margin-top:0;">${finalBody}</p>
    ${ctaButtonHtml}
    ${itemsTableHtml}
    <p style="margin-top:30px;font-weight:600;">${signoffHtml}</p>
  `, { logoUrl: brand.logoUrl || "", accent: brandColor, theme: brand.emailTheme });
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
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState("");
  const [resendDraft, setResendDraft] = useState("");
  const [removingResend, setRemovingResend] = useState(false);
  // Settings › Email sender: the stored `communications` map and the three sender fields being edited.
  const [comms, setComms] = useState<Record<string, any> | null>(null);
  const [sender, setSender] = useState<Sender>({ fromName: "", replyTo: "", fromEmail: "" });
  const [senderSaved, setSenderSaved] = useState<Sender>({ fromName: "", replyTo: "", fromEmail: "" });
  const [senderError, setSenderError] = useState("");
  const [savingSender, setSavingSender] = useState(false);
  const [group, setGroup] = useState<string>("orders");
  // The old Email sender address (focus "sender") opens on the tab holding the sender card.
  const [view, setView] = useSubTab<EmailView>(focus === "sender" ? "email-setup" : "email-templates", subTab, onSubTabChange);
  // "Preview with a real order": recent orders loaded on demand, filled in the browser only.
  const [recentOrders, setRecentOrders] = useState<any[] | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState("");
  const [deliveryLimit, setDeliveryLimit] = useState(50);
  const [deliveriesMore, setDeliveriesMore] = useState(false);
  const narrow = useNarrow(640);
  
  // Test Email states
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deliveries, setDeliveries] = useState<EmailLogEntry[] | null>(null);
  const [deliveriesError, setDeliveriesError] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "attention">("all");
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
      setComms(st?.communications || {}); setSender(found); setSenderSaved(found);
    }).catch(() => setSenderError("The saved sender details couldn't be loaded, so they can't be changed right now. Reload the page to try again."));
    loadSettings();
    loadDeliveries();
    loadQueue();
    // Default the test recipient to the signed-in admin so Send test works straight away.
    if (auth.currentUser?.email) setTestEmail((prev) => prev || auth.currentUser?.email || "");
  }, []);

  async function loadDeliveries(count = deliveryLimit) {
    try {
      const snap = await getDocs(query(collection(db, "emailLog"), orderBy("at", "desc"), limit(count)));
      setDeliveries(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setDeliveriesMore(snap.docs.length >= count);
      setDeliveriesError("");
    } catch (err: any) {
      console.warn("Could not load email delivery log:", err);
      setDeliveries([]);
      setDeliveriesError(err?.code === "permission-denied"
        ? "The delivery list isn't switched on for this shop yet (its security rules need updating). Emails still send."
        : "The delivery list couldn't be loaded. Choose Refresh to try again.");
    }
  }

  async function loadQueue() {
    try {
      const data = await emailFunction({ action: "emailQueue" });
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
      const result = await emailFunction({ action: "retryEmail", id: entry.id });
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
      await emailFunction({ action: "cancelEmail", id: entry.id });
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
            toast.error("Couldn't move your saved Resend key to the admin-only store. It has been kept; Save this page to try again.");
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

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      setTestResult({ ok: false, message: "Enter the email address the test should go to." });
      return;
    }
    setSendingTest(true);
    setTestResult(null);
    try {
      // What is on screen, saved or not: the template's words and the email branding.
      const { subject, body, buttonText, signoff } = currentTemplate;
      const { logoUrl, brandColor, emailTheme } = data.brand || ({} as NotificationSettings["brand"]);
      await emailFunction({
        templateId: activeTab,
        email: testEmail.trim(),
        template: { subject, body, buttonText, signoff },
        brand: { logoUrl, brandColor, emailTheme },
      });

      setTestResult({ ok: true, message: `Sent to ${testEmail.trim()}. Check that inbox (and its spam folder).` });
      toast.success(`Test email sent to ${testEmail}!`);
    } catch (err: any) {
      console.error("Test Email error:", err);
      const message = plainError(err, "The test email wasn't sent");
      setTestResult({ ok: false, message });
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

  const currentTemplate = data[activeTab] || DEFAULT_SETTINGS[activeTab];
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
  const subjectPreview = fillSample(activeTab, currentTemplate.subject || DEFAULT_SETTINGS[activeTab].subject, orderPreviewVars((recentOrders || []).find((o) => o.id === previewOrderId)));
  const badColor = !!data.brand?.brandColor && !/^#[0-9a-f]{3,8}$/i.test(data.brand.brandColor.trim());
  const problems = templateProblems(activeTab, currentTemplate);
  const defaults = DEFAULT_SETTINGS[activeTab];
  const isDefault = (["subject", "body", "buttonText", "signoff"] as const).every((k) => (currentTemplate[k] || "") === (defaults[k] || ""));
  const resetTemplate = () => {
    setData((prev) => ({ ...prev, [activeTab]: { ...defaults, enabled: prev[activeTab]?.enabled } }));
    toast.success("Default words restored. Save to keep them, or Discard to undo.");
  };
  const remember = (field: "subject" | "body" | "signoff") => (e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCursor({ field, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd });
  const addPlaceholder = (name: string) => {
    const token = `{{${name}}}`;
    // The order table is HTML: it only goes in the body (at the caret if the body was last used).
    const field = name === "items_table" ? "body" : cursor.field;
    const at = field === cursor.field ? cursor : { start: null, end: null };
    const next = insertAt(currentTemplate[field] || "", token, at.start, at.end);
    handleFieldChange(field, next.value);
    setCursor({ field, start: next.caret, end: next.caret });
    toast.success(`Added ${token} to the ${field === "body" ? "body copy" : field === "subject" ? "subject line" : "sign-off"}.`);
  };
  // Needs attention looks at each email's newest row: one a retry later delivered drops out.
  const attentionRows = currentRows(deliveries || []).filter(needsAttention);
  const shownDeliveries = deliveryFilter === "all" ? (deliveries || []) : attentionRows;
  const attentionCount = attentionRows.length;

  const queueColumns = [
    { key: "status", header: "Status", render: (r: QueuedEmail) => <StatusBadge tone={r.status === "failed" ? "danger" : "warning"}>{r.status === "failed" ? "Gave up" : "Will retry"}</StatusBadge> },
    { key: "to", header: "To", lead: true, render: (r: QueuedEmail) => r.to || "—" },
    { key: "subject", header: "Subject", render: (r: QueuedEmail) => r.subject || "—" },
    { key: "tries", header: "Tries", render: (r: QueuedEmail) => `${r.attempts} of ${MAX_TRIES}` },
    { key: "next", header: "Next try", render: (r: QueuedEmail) => (r.status === "pending" && r.nextAttemptAt ? new Date(r.nextAttemptAt).toLocaleString() : "—") },
    { key: "error", header: "Last problem", render: (r: QueuedEmail) => <span style={{ whiteSpace: "normal" }}>{r.lastError || "—"}</span> },
    { key: "actions", header: "Actions", render: (r: QueuedEmail) => (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <SecondaryButton size="sm" disabled={!!queueBusy} onClick={() => retryQueued(r)} aria-label={`Retry now: ${r.subject || "email"} to ${r.to}`}>{queueBusy === r.id ? "Sending…" : "Retry now"}</SecondaryButton>
        <GhostButton size="sm" disabled={!!queueBusy} onClick={() => stopQueued(r)} aria-label={`Stop sending ${r.subject || "email"} to ${r.to}`}>Stop sending</GhostButton>
      </div>
    ) },
  ];
  const deliveryColumns = [
    { key: "status", header: "Status", render: (r: EmailLogEntry) => { const badge = emailLogBadge(r); return <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>; } },
    { key: "when", header: "When", render: (r: EmailLogEntry) => (r.at ? new Date(r.at).toLocaleString() : "—") },
    { key: "to", header: "To", lead: true, render: (r: EmailLogEntry) => r.to || "—" },
    { key: "subject", header: "Subject", render: (r: EmailLogEntry) => r.subject || "—" },
    { key: "detail", header: "Detail", render: (r: EmailLogEntry) => <span style={{ whiteSpace: "normal" }}>{emailLogDetail(r)}</span> },
  ];
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
    if (!(await confirm({ title: "Remove the stored Resend key?", message: "The backup sender will use the RESEND_API_KEY set in Firebase Functions (if any) until you enter a new key.", confirmLabel: "Remove key" }))) return;
    setRemovingResend(true);
    try {
      await adminApi.removeResendKey();
      const clear = (text: string) => { try { const o = JSON.parse(text); o.brand = { ...(o.brand || {}), resendApiKeyStored: false, resendApiKey: "" }; return JSON.stringify(o); } catch { return text; } };
      setData(prev => ({ ...prev, brand: { ...prev.brand, resendApiKeyStored: false, resendApiKey: "" } }));
      setOriginal(clear);
      setResendDraft("");
      toast.success("Stored Resend key removed");
    } catch (err: any) {
      toast.error(plainError(err, "The key wasn't removed"));
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

  return (
    <div className="rp-stack">
      <Tabs<EmailView> variant="page" label="Email sender" value={view} onChange={setView} tabs={[
        { id: "email-templates", label: "Emails", unsaved: templatesDirty, ...(Object.keys(allProblems).length ? { count: Object.keys(allProblems).length } : {}) },
        { id: "email-setup", label: "Sending setup", unsaved: brandDirty || senderDirty },
        { id: "email-deliveries", label: "Deliveries", ...(queue.length + attentionCount ? { count: queue.length + attentionCount } : {}) },
      ]} />
      {/* At a glance: what needs the owner, whichever sub tab is open. */}
      <nav aria-label="Email sender at a glance" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {queueError ? <StatusBadge tone="warning">Couldn't check the send queue</StatusBadge>
          : queue.length ? <StatusBadge tone={gaveUpCount ? "danger" : "warning"}>{gaveUpCount ? `${gaveUpCount} email${gaveUpCount === 1 ? "" : "s"} not sent` : `${waitingCount} email${waitingCount === 1 ? "" : "s"} waiting to send`}</StatusBadge>
          : <StatusBadge tone="success">Nothing waiting to send</StatusBadge>}
        {deliveries !== null && !deliveriesError && (attentionCount
          ? <StatusBadge tone="danger">{attentionCount} delivery problem{attentionCount === 1 ? "" : "s"}</StatusBadge>
          : <StatusBadge tone="success">Recent emails delivered</StatusBadge>)}
        {Object.keys(allProblems).length > 0 && <StatusBadge tone="warning">{Object.keys(allProblems).length} template{Object.keys(allProblems).length === 1 ? "" : "s"} to check</StatusBadge>}
        {pausedCount > 0 && <StatusBadge tone="neutral">{pausedCount} customer email{pausedCount === 1 ? "" : "s"} paused</StatusBadge>}
        {(queue.length > 0 || attentionCount > 0) && <>
          <span style={{ flex: "1 1 auto" }} />
          <GhostButton size="sm" onClick={() => { if (attentionCount) setDeliveryFilter("attention"); setView("email-deliveries"); }}>Show deliveries</GhostButton>
        </>}
      </nav>


      <TabPanel tabId="email-setup" active={view === "email-setup"}>
      <div className="rp-stack">
      <GmailSendingCard lastProblem={lastGmailProblem(deliveries || [])} />

      <div id="email-sender" style={{ scrollMarginTop: 16 }} />
      <SectionCard title="Email sender" description="Who it's from. Where replies go.">
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <TextField label="Sender name" value={sender.fromName} placeholder="Lyricalmyrical Books" error={senderIssues.fromName}
            onChange={(e) => setSender(prev => ({ ...prev, fromName: e.target.value }))} />
          <TextField label="Reply-to address" type="email" value={sender.replyTo} placeholder="lyricalmyricalbooks@gmail.com" error={senderIssues.replyTo}
            hint="Blank = the sending address."
            onChange={(e) => setSender(prev => ({ ...prev, replyTo: e.target.value }))} />
          <TextField label="Backup sender address (Resend)" type="email" value={sender.fromEmail} placeholder="orders@your-domain.com" error={senderIssues.fromEmail}
            hint="Resend backup only."
            onChange={(e) => setSender(prev => ({ ...prev, fromEmail: e.target.value }))} />
        </div>
        {senderError && <p className="rp-error-text" role="alert">{senderError}</p>}
        <div style={{ marginTop: 12 }}>
          <PrimaryButton onClick={saveSender} disabled={savingSender || comms === null || !senderDirty || Object.keys(senderIssues).length > 0}>{savingSender ? "Saving…" : "Save email sender"}</PrimaryButton>
        </div>
      </SectionCard>

      <SectionCard title="Email branding" description="One look for every email.">
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <TextField label="Brand logo URL" value={data.brand?.logoUrl || ""} placeholder="https://domain.com/logo.png"
            error={data.brand?.logoUrl && !safeLogoUrl(data.brand.logoUrl) ? "Use an https:// image address. Other addresses are left out of emails." : undefined}
            onChange={(e) => handleBrandChange("logoUrl", e.target.value)} />
          <div className="rp-field">
            <label className="rp-label" htmlFor="brand-color">Brand accent color</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="brand-color" type="color" aria-label="Pick brand accent color" value={data.brand?.brandColor || "#e8402a"} onChange={(e) => handleBrandChange("brandColor", e.target.value)}
                style={{ width: 48, height: 44, padding: 2, border: "1px solid var(--rp-border)", background: "var(--rp-input-bg)" }} />
              <input className="rp-input rp-mono" aria-label="Brand accent color hex" value={data.brand?.brandColor || ""} placeholder="#e8402a"
                aria-invalid={badColor || undefined} onChange={(e) => handleBrandChange("brandColor", e.target.value)} />
            </div>
            {badColor && <p className="rp-error-text" role="alert" style={{ margin: "6px 0 0" }}>Use a colour code like #e8402a. Until then emails use flare red.</p>}
          </div>
          <SelectField label="Email theme" value={data.brand?.emailTheme === "dark" ? "dark" : "light"} onChange={(e) => handleBrandChange("emailTheme", e.target.value)}
            hint="Light = cream paper. Dark = black paper.">
            <option value="light">Light (newsprint)</option>
            <option value="dark">Dark (Riso Noir)</option>
          </SelectField>
        </div>
        <details style={{ marginTop: 16 }}>
          <summary className="rp-label" style={{ cursor: "pointer" }}>Advanced: backup sender (Resend){resendStored ? " · key stored" : ""}</summary>
          <p className="rp-hint">Backup if Gmail fails. Reaches only you without a verified domain.</p>
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
            <p className="rp-hint" style={{ margin: "12px 0 0", color: "var(--rp-warning)" }}>
              ⚠ This key was once saved where the storefront could read it and has been moved to the admin-only store. Rotate it in Resend to be safe.
            </p>
          )}
        </details>
      </SectionCard>

      </div>
      </TabPanel>

      <TabPanel tabId="email-templates" active={view === "email-templates"}>
      <div className="rp-stack">
      <div>
        <Tabs label="Event group" value={group} onChange={pickGroup}
          tabs={GROUP_IDS.map((g) => ({ id: g, label: `${GROUP_LABELS[g] || (g === "shopAlerts" ? "Shop alerts" : g)}${groupProblemCount(g) ? " ⚠" : ""}`, ...(groupProblemCount(g) ? { count: groupProblemCount(g) } : {}) }))} />
        {group !== "shopAlerts" && groupTabs.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <Tabs label="Email template" value={activeTab as string} onChange={(id) => setActiveTab(id as TemplateKey)}
              tabs={groupTabs.map((t) => ({ id: t.id as string, label: `${t.label}${allProblems[t.id] ? " ⚠" : ""}` }))} />
          </div>
        )}
      </div>

      {group === "shopAlerts" ? (
        <SectionCard title="Shop alerts" description="Emails to you, not customers.">
          <div className="rp-stack" style={{ gap: 16 }}>
            <Toggle label="New order alerts — a paid order, or an order waiting for a manual payment" checked={shopAlerts.newOrder !== false}
              onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, newOrder: on } })} />
            <p className="rp-hint" style={{ margin: 0 }}>Subject “[NEW ORDER] …”, fixed so filters keep working.</p>
            <Toggle label="Shipped copy — a copy of each order you mark as shipped" checked={shopAlerts.shipped !== false}
              onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, shipped: on } })} />
            <Toggle label="Daily “orders needing you” email (8am)" checked={shopAlerts.dailyOrderDigest !== false}
              onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, dailyOrderDigest: on } })} />
            <p className="rp-hint" style={{ margin: 0 }}>Late orders, stuck parcels, odd labels. Silent on quiet days.</p>
            <Toggle label="Monday summary — last week's sales and visits, with a PDF of the highlights (Mondays, 8am)" checked={shopAlerts.weeklySummary !== false}
              onChange={(on) => setShopAlert({ shopAlerts: { ...shopAlerts, weeklySummary: on } })} />
            <p className="rp-hint" style={{ margin: 0 }}>Sales, visits and best sellers vs last week.</p>
            <WeeklySummaryNow />
          </div>
        </SectionCard>
      ) : (
      <div className="rp-split" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))" }}>
        <SectionCard title={TABS.find((t) => t.id === activeTab)?.label || "Template"}
          actions={<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!isDefault && <SecondaryButton size="sm" onClick={resetTemplate}>Reset to default</SecondaryButton>}
            <StatusBadge tone={enabled ? "success" : "neutral"}>{enabled ? "Sending" : "Paused"}</StatusBadge>
          </div>}>
          <div className="rp-stack" style={{ gap: 20 }}>
            <Toggle label="Send this email automatically" checked={enabled} onChange={() => handleToggleActive()} />
            {activeTab === "review_request" && (
              <TextField label="Days after shipping" type="number" min={1} max={90}
                value={delayDraft ?? String((currentTemplate as any).delayDays ?? 14)}
                hint="Days after shipping (1–90)."
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
            <TextField label="Subject line" value={currentTemplate.subject} placeholder="Subject line" onSelect={remember("subject")} onChange={(e) => handleFieldChange("subject", e.target.value)} />
            <TextArea label="Body copy" rows={7} value={currentTemplate.body} placeholder="Write your email body here…" onSelect={remember("body")} onChange={(e) => handleFieldChange("body", e.target.value)} />
            <TextField label="Button text" value={currentTemplate.buttonText} placeholder="View details" hint="Leave blank to hide the button." onChange={(e) => handleFieldChange("buttonText", e.target.value)} />
            <TextArea label="Sign-off" rows={2} value={currentTemplate.signoff} placeholder="Thanks," style={{ minHeight: 64 }} onSelect={remember("signoff")} onChange={(e) => handleFieldChange("signoff", e.target.value)} />

            {problems.length > 0 && (
              <div role="status" className="rp-stack" style={{ gap: 8 }}>
                {problems.map((p) => (
                  <p key={p.text} className="rp-hint" style={{ margin: 0, padding: 12, border: `1px solid var(--rp-${p.tone})`, color: `var(--rp-${p.tone})`, background: `var(--rp-${p.tone}-tint)` }}>
                    {p.tone === "danger" ? "✕ " : "! "}{p.text}
                  </p>
                ))}
              </div>
            )}

            <div>
              <div className="rp-sect">Placeholders</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(PLACEHOLDERS[activeTab as keyof typeof PLACEHOLDERS] || []).map((name) => (
                  <button key={name} type="button" className="rp-btn rp-btn-secondary rp-btn-sm rp-mono" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}
                    onMouseDown={(e) => e.preventDefault()} onClick={() => addPlaceholder(name)}>{`{{${name}}}`}</button>
                ))}
              </div>
              <p className="rp-hint" style={{ margin: "8px 0 0" }}>Click to insert at your cursor.</p>
            </div>

            <div className="rp-card" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
              <div className="rp-sect">Send a test</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <div id="notif-send-test" style={{ flex: "1 1 220px" }}>
                  <TextField label="Send test to" type="email" value={testEmail} placeholder="admin@example.com" onChange={(e) => setTestEmail(e.target.value)} />
                </div>
                <SecondaryButton onClick={handleSendTestEmail} disabled={sendingTest}>{sendingTest ? "Sending…" : "Send test"}</SecondaryButton>
              </div>
              {testResult && (
                <p role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${testResult.ok ? "--rp-success" : "--rp-danger"})`, color: `var(${testResult.ok ? "--rp-success" : "--rp-danger"})`, background: `var(${testResult.ok ? "--rp-success-tint" : "--rp-danger-tint"})` }}>
                  {testResult.ok ? "✓ " : "✕ "}{testResult.message}
                </p>
              )}
              <p className="rp-hint" style={{ margin: "8px 0 0" }}>Sends this draft with sample details.</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Live preview" description={subjectPreview}>
          <div style={{ marginBottom: 12 }} onFocus={loadRecentOrders} onMouseEnter={loadRecentOrders}>
            <SelectField label="Preview with" value={previewOrderId} onChange={(e) => setPreviewOrderId(e.target.value)}
              hint="Preview with a real order. Nothing sent.">
              <option value="">Sample order</option>
              {(recentOrders || []).map((o) => <option key={o.id} value={o.id}>{o.orderId || o.id} · {o.customer?.name || o.customer?.email || "Customer"}</option>)}
            </SelectField>
          </div>
          <iframe srcDoc={compilePreviewHtml(activeTab, data, previewOrder)} sandbox="" title={`Preview of the ${TABS.find((t) => t.id === activeTab)?.label} email`}
            style={{ width: "100%", height: 560, border: "1px solid var(--rp-border)", background: "var(--rp-surface)" }} />
        </SectionCard>
      </div>
      )}

      </div>
      </TabPanel>

      <TabPanel tabId="email-deliveries" active={view === "email-deliveries"}>
      <div className="rp-stack">
      {queueError && queue.length === 0 && (
        <SectionCard title="Waiting to send" collapsible={false}>
          <ErrorState title="Couldn't check for emails waiting to send" description="Some emails may be waiting to be tried again. Recent deliveries below still lists every attempt." onRetry={() => { void loadQueue(); }} />
        </SectionCard>
      )}
      {queue.length > 0 && (
        <div id="email-waiting" style={{ scrollMarginTop: 16 }}>
        <SectionCard title="Waiting to send" collapsible={false} description={`Retried automatically, up to ${MAX_TRIES} times.`}
          actions={<SecondaryButton size="sm" onClick={loadQueue}>Refresh</SecondaryButton>} flush>
          <RowsOrCards narrow={narrow} caption="Emails waiting to be sent again" rows={queue} rowKey={(r) => r.id}
            rowState={(r) => (r.status === "failed" ? "failed" : undefined)} columns={queueColumns} />
        </SectionCard>
        </div>
      )}

      <SectionCard title="Recent deliveries" description="Last 90 days, newest first."
        actions={<GhostButton onClick={() => { loadDeliveries(); loadQueue(); }}>Refresh</GhostButton>} flush>
        <div style={{ padding: "12px 16px 0" }}>
          <Tabs label="Show deliveries" value={deliveryFilter} onChange={(id) => setDeliveryFilter(id === "attention" ? "attention" : "all")}
            tabs={[{ id: "all", label: "All", count: (deliveries || []).length }, { id: "attention", label: "Needs attention", count: attentionCount }]} />
        </div>
        <RowsOrCards narrow={narrow} caption="Recent email deliveries" rows={shownDeliveries} rowKey={(r) => r.id}
          rowState={(r) => (r.status === "failed" ? "failed" : undefined)}
          empty={<p className="rp-hint" style={{ margin: 0, padding: 16 }}>{deliveriesError || (deliveries === null ? "Loading…" : deliveryFilter === "attention" ? "Nothing needs attention — every recent email was accepted." : "No emails recorded yet. Send a test to check the setup.")}</p>}
          columns={deliveryColumns} />
        {deliveriesMore && (
          <div style={{ padding: 16 }}>
            <SecondaryButton size="sm" onClick={() => { const next = deliveryLimit + 50; setDeliveryLimit(next); loadDeliveries(next); }}>Load 50 more</SecondaryButton>
          </div>
        )}
      </SectionCard>
      </div>
      </TabPanel>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave}
        onDiscard={() => { setData(JSON.parse(original)); setResendDraft(""); }}
        message={problemLabels.length ? `Unsaved template changes. Check: ${problemLabels.join(", ")}.` : "You have unsaved template changes."} />
      {confirmNode}
    </div>
  );
}

/** Under 640px each row becomes a stacked card (label: value), so nothing scrolls sideways. */
function useNarrow(px: number) {
  const query = `(max-width: ${px - 0.02}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return narrow;
}

function RowsOrCards<T>({ narrow, columns, rows, rowKey, caption, empty, rowState }: {
  narrow: boolean; columns: Array<{ key: string; header: string; lead?: boolean; render: (r: T) => ReactNode }>; rows: T[]; rowKey: (r: T) => string;
  caption: string; empty?: ReactNode; rowState?: (r: T) => "failed" | undefined;
}) {
  if (!narrow) return <DataTable<T> caption={caption} rows={rows} rowKey={rowKey} rowState={rowState} empty={empty} columns={columns} />;
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <ul aria-label={caption} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {rows.map((r) => (
        <li key={rowKey(r)} style={{ padding: 16, borderBottom: "1px solid var(--rp-divider)", background: rowState?.(r) === "failed" ? "var(--rp-danger-tint)" : undefined }}>
          <dl style={{ margin: 0, display: "grid", gap: 6 }}>
            {columns.map((c) => (
              <div key={c.key} style={{ display: "grid", gridTemplateColumns: "88px 1fr", gap: 8, alignItems: "start" }}>
                <dt className="rp-label" style={{ margin: 0 }}>{c.header}</dt>
                <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere", fontWeight: c.lead ? 600 : undefined }}>{c.render(r)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

/** Settings › Email sender › Shop alerts › Send me last week's summary now (the Monday email, on demand). */
function WeeklySummaryNow() {
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try {
      await emailFunction({ action: "weeklySummaryNow" });
      toast.success("Last week's summary is on its way to lyricalmyricalbooks@gmail.com");
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
