import { useState, useEffect, useMemo, useRef } from "react";
import { adminApi } from "./api";
import toast from "react-hot-toast";
import { POLICY_KEYS, POLICY_TITLES, policySlug, type PolicyKey } from "../features/site/policyPages";
import { ActionMenu, Checkbox, ConfirmDialog, LoadingState, MetricCard, DestructiveButton, Dialog, EmptyState, ErrorState, PrimaryButton, SaveBar, SearchField, SecondaryButton, SectionCard, SelectField, StatusBadge, TabPanel, Tabs, TextArea, TextField, Toggle, useConfirm } from "./riso/components";
// `m` + the app-wide LazyMotion (domAnimation): the full `motion` component would pull layout/drag code into the shop's first load.
import { m, AnimatePresence } from "motion/react";
import { NotificationEditor } from "./NotificationEditor";
import { COUNTRIES, CONTINENTS } from "../features/site/shippingZones";
import { summarizeShipping, describeRatePrice, describeRateConditions, RATE_TYPES, starterZones, carrierIssues, issuesForTab, shippingIssueTab, SHIPPING_ISSUE_TAB_LABELS, type ShippingIssue, type ShippingIssueTab } from "./shippingHealth";
import { quoteShipping } from "../features/site/shippingEngine";
import { LocalFulfillmentSettings, useLocalFulfillmentDraft } from "./LocalFulfillmentSettings";
import { paymentHealth } from "./paymentHealth";
import { stripeSecretKeyProblem } from "./privateKeys";
import { StripeWebhookHealth } from "./StripeWebhookHealth";
import { PrivacyRequestsCard } from "./PrivacyRequestsCard";
import { RedirectsCard } from "./RedirectsCard";
import { AddressFinderCard } from "./AddressFinderCard";
import { AiWriterCard } from "./AiWriterCard";
import { GoogleAnalyticsCard } from "./GoogleAnalyticsCard";
import { ClarityCard } from "./ClarityCard";
import { OwnVisitsCard } from "./OwnVisitsCard";
import { SearchConsoleCard } from "./SearchConsoleCard";
import { assignedCountryNames, countryName, groupedCountries, remainingCountryNames, toCountryCodes } from "./shippingCountries";
import { saveSectionsInOrder } from "./settingsSave";
import { NewShippingProfileDialog } from "./NewShippingProfileDialog";
import { duplicateProfile, profileSummary } from "./shippingProfileStarters";

/** Same cap as functions/liveRateExtra.js MAX_LIVE_RATE_EXTRA. */
const MAX_LIVE_RATE_EXTRA = 50;
import { TaxesSettings } from "./TaxesSettings";
import { BackupsExportCard } from "./BackupsExportCard";
import { ShopErrorsCard } from "./ShopErrorsCard";
import { useSettingsDirty } from "./settingsDirty";
import { SettingsAnchor, SettingsGroup, SettingsTabs, friendlyError, useSubTab, type SettingsTab } from "./settingsLayout";
import { testSaleSteps } from "./testSaleWalkthrough";
import { studioHash } from "../lib/studioLocation";

export function ShopSettings({ 
  activeTab, 
  setActiveTab, 
  settings, 
  setSettings, 
  originalSettings, 
  setOriginalSettings,
  settingsLoading,
  saveSection,
  onUnderConstruction,
  onOpenOrders,
  subTab,
  onSubTabChange,
}: any) {
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [shippingProfiles, setShippingProfiles] = useState<any[]>([]);
  // A failed read must not look like "No shipping profiles".
  const [profilesError, setProfilesError] = useState(false);
  // Payments › Shippo opens Shipping straight on Carrier & labels.
  const [shippingStart, setShippingStart] = useState<"overview" | "carrier">("overview");

  useEffect(() => {
    loadShippingProfiles();
  }, []);

  async function loadShippingProfiles() {
    try {
      const b = await adminApi.getShippingProfiles();
      setShippingProfiles(b);
      setProfilesError(false);
      return b;
    } catch (err) {
      console.error(err);
      setProfilesError(true);
      return null;
    }
  }

  const handleSaveSection = async (section: string, data: any, options: any = {}): Promise<boolean> => {
    setSavingSection(section);
    try {
      return (await saveSection(section, data, options)) !== false;
    } finally {
      setSavingSection(null);
    }
  };

  const hasChanges = (section: string) => {
    if (!settings || !originalSettings) return false;
    return JSON.stringify(settings[section]) !== JSON.stringify(originalSettings[section]);
  };

  if (settingsLoading) return <LoadingState label="Loading your shop settings…" />;

  if (!settings) return <ErrorState title="Settings unavailable" description="Store settings could not be loaded. Check your connection, then reload this page." />;

  // Designer tab — handled by Dashboard for full-screen takeover
  if (activeTab === "designer") {
    return null;
  }

  return (
    <div className="rp-settings pb-32">
      <AnimatePresence mode="wait">
        <m.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-12"
        >
          {activeTab === "general" && <GeneralSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection} onUnderConstruction={onUnderConstruction} subTab={subTab} onSubTabChange={onSubTabChange} />}
          {activeTab === "shipping" && <ShippingSettings profiles={shippingProfiles} profilesError={profilesError} refreshProfiles={loadShippingProfiles} initialView={shippingStart} subTab={subTab} onSubTabChange={onSubTabChange} />}
          {activeTab === "payments" && <PaymentsSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} setOriginalSettings={setOriginalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection}
            subTab={subTab} onSubTabChange={onSubTabChange}
            onOpenShipping={() => { setActiveTab("shipping"); if (onSubTabChange) onSubTabChange("carrier", "shipping"); else setShippingStart("carrier"); }} onOpenOrders={onOpenOrders} onOpenNotifications={() => setActiveTab("notifications")} />}
          {activeTab === "taxes" && <TaxesSettings settings={settings} setSettings={setSettings} originalSettings={originalSettings} hasChanges={hasChanges} saveSection={handleSaveSection} savingSection={savingSection} />}
          {/* Communications was retired: its links open Notifications. */}
          {(activeTab === "notifications" || activeTab === "communications") && <NotificationEditor focus={activeTab === "communications" ? "sender" : undefined} subTab={subTab} onSubTabChange={onSubTabChange} />}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
const POLICY_STARTERS: Record<PolicyKey, string> = {
  shipping: "We process orders within 1–3 business days of payment. Carrier transit time is additional and shown at checkout for your destination and selected service.\n\nYou will receive an email with tracking once your order ships. Digital titles are available to download immediately after payment.",
  returns: "Once an order has shipped it can't be returned. Until it ships, you can ask to cancel it from the order tracking page (the link is in your order confirmation email).\n\nIf your book arrives damaged or incorrect, contact us within 30 days of delivery and we will replace it or refund you.\n\nDigital downloads are non-refundable once accessed, unless the file is faulty.",
  privacy: "We collect only what we need to fulfil your order and, if you opt in, send you our newsletter: your name, email, shipping address and order details.\n\nPayments are processed by Stripe; we never see or store your card number. We do not sell your personal information. You can ask us to delete your data at any time.",
  terms: "By placing an order you agree that the details you provide are accurate and that you are authorised to use the payment method.\n\nPrices are shown in Canadian dollars unless stated otherwise. We may cancel and refund an order if a title is unavailable or a pricing error occurred.",
};

// SaveBar names the cards that have unsaved edits, not the settings keys behind them.
export const GENERAL_SECTION_TITLES: Record<string, string> = {
  maintenance: "Store status", stockHolds: "Checkout stock holds", info: "Store identity", domain: "Domain & visibility", location: "Location", policies: "Store policies",
};

function GeneralSettings({ settings, setSettings, originalSettings, hasChanges, saveSection, savingSection, onUnderConstruction, subTab, onSubTabChange }: any) {
  const SECTIONS = ["maintenance", "stockHolds", "domain", "info", "location", "policies"] as const;
  const dirty = SECTIONS.filter((k) => hasChanges(k));
  useSettingsDirty("general", dirty.length > 0);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  // Functional update: a set after an await (e.g. the store-status confirm) must not restore stale values.
  const set = (section: string, patch: any) => setSettings((prev: any) => ({ ...prev, [section]: { ...prev?.[section], ...patch } }));

  const saveAll = async () => {
    // A failed section already shows its own error; only announce success when all saved.
    if (await saveSectionsInOrder(dirty, (k) => saveSection(k, { [k]: settings[k] }))) toast.success("Store settings saved");
  };
  const discard = () => {
    const next = { ...settings };
    dirty.forEach((k) => { next[k] = JSON.parse(JSON.stringify(originalSettings?.[k] ?? {})); });
    setSettings(next);
  };

  const maintenanceOn = !!settings.maintenance?.enabled;
  const name = settings.info?.name || "";
  const desc = settings.info?.description || "";
  const [view, setView] = useSubTab<string>("gs-store", subTab, onSubTabChange);
  const tabs: SettingsTab[] = [
    { id: "gs-store", title: "Shop status & checkout", unsaved: hasChanges("maintenance") || hasChanges("stockHolds") },
    { id: "gs-details", title: "Shop details", unsaved: ["info", "location", "policies", "domain"].some((k) => hasChanges(k)) },
    { id: "gs-visitors", title: "Visitors & Google" },
    { id: "gs-tools", title: "Tools & records" },
  ];

  return (
    <div className="rp-stack">
      <SettingsTabs label="General settings" tabs={tabs} value={view} onChange={setView} />

      <SettingsGroup id="gs-store" active={view === "gs-store"}>
        <SettingsAnchor id="gs-status">
          <SectionCard title="Store status" description="Open, paused or behind the wall.">
            {(() => {
              const wall = !!settings.design?.showUnderConstruction;
              const status = wall ? "construction" : maintenanceOn ? "maintenance" : "open";
              const choose = async (next: string) => {
                if (next === status) return;
                // The wall is published straight away (same switch as the top bar); maintenance waits for Save.
                if (next === "construction") { await onUnderConstruction?.(true); return; }
                // `false` = the owner cancelled taking the wall down; stop without touching maintenance.
                if (wall && (await onUnderConstruction?.(false)) === false) return;
                if (next === "maintenance") setConfirmMaintenance(true);
                else set("maintenance", { enabled: false });
              };
              const options = [
                { id: "open", label: "Open", hint: "Browse and buy." },
                { id: "maintenance", label: "Maintenance — checkout paused", hint: "Browse only. Your message shows. Applies on save." },
                { id: "construction", label: "Under construction wall", hint: "The shop hides behind the wall. Instant." },
              ];
              return (
                <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="rp-sr-only">Store status</legend>
                  <div style={{ marginBottom: 12 }}>
                    <StatusBadge tone={status === "open" ? "success" : "warning"}>{status === "open" ? "Storefront live" : status === "maintenance" ? "Checkout paused" : "Behind construction wall"}</StatusBadge>
                    {settings.domain?.custom && <span className="rp-hint" style={{ marginLeft: 12 }}>Domain: {settings.domain.custom}</span>}
                  </div>
                  <div className="rp-choices">
                    {options.map((o) => (
                      <label key={o.id} className="rp-choice">
                        <input type="radio" name="store-status" value={o.id} checked={status === o.id} onChange={() => void choose(o.id)} />
                        <span><span className="rp-choice-label">{o.label}</span><span className="rp-hint" style={{ display: "block" }}>{o.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })()}
            {maintenanceOn && (
              <div style={{ marginTop: 16 }}>
                <TextField label="Maintenance message" value={settings.maintenance?.message || ""}
                  placeholder="We are updating our archive. Please check back soon." onChange={(e) => set("maintenance", { message: e.target.value })} />
              </div>
            )}
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="gs-holds">
          <SectionCard title="Checkout stock holds" description="Held 30 minutes at checkout. E-books never count.">
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {([
                { key: "perBook", label: "Most copies of one book", hint: "Per shopper. Default 10.", max: 99, placeholder: "10" },
                { key: "units", label: "Most copies in total", hint: "Default 50.", max: 2000, placeholder: "50" },
                { key: "orders", label: "Most open checkouts", hint: "Default 3.", max: 50, placeholder: "3" },
              ] as const).map((f) => (
                <TextField key={f.key} label={f.label} type="number" min={1} max={f.max} hint={f.hint} placeholder={`${f.placeholder} (default)`}
                  value={String(settings.stockHolds?.[f.key] ?? "")}
                  onChange={(e) => set("stockHolds", { [f.key]: e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))) })} />
              ))}
            </div>
          </SectionCard>
        </SettingsAnchor>
      </SettingsGroup>

      <SettingsGroup id="gs-details" active={view === "gs-details"}>
        <SettingsAnchor id="gs-identity">
          <SectionCard title="Store identity" description="Name, blurb, contact.">
            <div className="rp-stack" style={{ gap: 20 }}>
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                <TextField label="Publisher name" value={name} maxLength={100} hint={`${name.length} / 100 characters`} onChange={(e) => set("info", { name: e.target.value })} />
                <TextField label="Contact email" type="email" value={settings.info?.email || ""} placeholder="hello@lyricalmyricalbooks.com" onChange={(e) => set("info", { email: e.target.value })} />
              </div>
              <TextArea label="Publisher description" rows={4} value={desc} maxLength={150} hint={`${desc.length} / 150 · search and social previews`} onChange={(e) => set("info", { description: e.target.value })} />
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="gs-location">
          <SectionCard title="Location" description="Where parcels ship from.">
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <TextField label="Street address" value={settings.location?.street || ""} placeholder="456 Montrose Avenue" onChange={(e) => set("location", { street: e.target.value })} />
              </div>
              <TextField label="City" value={settings.location?.city || ""} placeholder="Toronto" onChange={(e) => set("location", { city: e.target.value })} />
              <TextField label="State / province" value={settings.location?.state || ""} placeholder="Ontario" onChange={(e) => set("location", { state: e.target.value })} />
              <TextField label="Postal code" value={settings.location?.zip || ""} placeholder="M6G 3H1" autoComplete="postal-code" onChange={(e) => set("location", { zip: e.target.value })} />
              <SelectField label="Country" value={settings.location?.country || "Canada"} onChange={(e) => set("location", { country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
              </SelectField>
              <TextField label="Phone" type="tel" value={settings.location?.phone || ""} placeholder="647 409 6863" autoComplete="tel"
                hint="On labels, for the carrier." onChange={(e) => set("location", { phone: e.target.value })} />
            </div>
            <p className="rp-hint" style={{ margin: "12px 0 0" }}>The “from” address on labels and live rates.</p>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="gs-policies">
          <SectionCard title="Store policies" description="Footer links. Blank ones hide.">
            <div className="rp-stack" style={{ gap: 20 }}>
              {POLICY_KEYS.map((k) => {
                const text: string = settings.policies?.[k] || "";
                return (
                  <div key={k}>
                    <TextArea label={POLICY_TITLES[k]} rows={5} maxLength={20000} value={text}
                      hint={text.trim() ? `Live at /page/${policySlug(k)}` : "Hidden until it has text."}
                      onChange={(e) => set("policies", { [k]: e.target.value })} />
                    {!text.trim() && (
                      <SecondaryButton size="sm" onClick={() => set("policies", { [k]: POLICY_STARTERS[k] })}>Insert starter text</SecondaryButton>
                    )}
                  </div>
                );
              })}
              <p className="rp-hint" style={{ margin: 0 }}>Starter text is a sketch, not legal advice.</p>
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="gs-domain">
          <SectionCard title="Domain & visibility" description="For your records.">
            <TextField label="Custom domain" value={settings.domain?.custom || ""} placeholder="lyricalmyricalbooks.com"
              hint="Doesn't move the shop. The domain is already live."
              onChange={(e) => set("domain", { custom: e.target.value })} />
          </SectionCard>
        </SettingsAnchor>
      </SettingsGroup>

      <SettingsGroup id="gs-visitors" active={view === "gs-visitors"}>
        <SettingsAnchor id="gs-own-visits"><OwnVisitsCard /></SettingsAnchor>
        <SettingsAnchor id="gs-analytics"><GoogleAnalyticsCard /></SettingsAnchor>
        <SettingsAnchor id="gs-clarity"><ClarityCard /></SettingsAnchor>
        <SettingsAnchor id="gs-search-console"><SearchConsoleCard /></SettingsAnchor>
        <SettingsAnchor id="gs-redirects"><RedirectsCard /></SettingsAnchor>
      </SettingsGroup>

      <SettingsGroup id="gs-tools" active={view === "gs-tools"}>
        <SettingsAnchor id="gs-ai"><AiWriterCard /></SettingsAnchor>
        <SettingsAnchor id="gs-privacy"><PrivacyRequestsCard /></SettingsAnchor>
        <SettingsAnchor id="gs-backups"><BackupsExportCard /></SettingsAnchor>
        <SettingsAnchor id="gs-shop-errors"><ShopErrorsCard /></SettingsAnchor>
      </SettingsGroup>

      <SaveBar dirty={dirty.length > 0} saving={!!savingSection} onSave={saveAll} onDiscard={discard}
        message={`Unsaved changes in ${dirty.map((k) => GENERAL_SECTION_TITLES[k] || k).join(", ")}.`} />

      <ConfirmDialog open={confirmMaintenance} title="Turn on maintenance mode?" confirmLabel="Pause checkout"
        message="Shoppers can still browse, but checkout is refused (card, PayPal, e-Transfer and free orders) until you turn it off again. The change applies once you save."
        onConfirm={() => { setConfirmMaintenance(false); set("maintenance", { enabled: true }); }} onCancel={() => setConfirmMaintenance(false)} />
    </div>
  );
}

function RateTester({ profile }: { profile: any }) {
  const [country, setCountry] = useState("Canada");
  const [total, setTotal] = useState("40");
  const [count, setCount] = useState("2");
  const [grams, setGrams] = useState("");
  const qty = Math.max(1, Number(count) || 1);
  const each = (Number(total) || 0) / qty;
  const quotes = useMemo(() => quoteShipping(
    [{ price: each, quantity: qty, shippingProfileId: profile.id, weightGrams: grams === "" ? null : (Number(grams) || 0) / qty }],
    { country }, [profile]).filter((q) => q.type !== "pickup"), [profile, country, each, qty, grams]);
  return (
    <SectionCard>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 12 }}>
        <SelectField label="Destination" value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
        </SelectField>
        <TextField label="Order total ($)" type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} />
        <TextField label="Books in cart" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        <TextField label="Total weight (g)" type="number" min={0} placeholder="auto" value={grams} onChange={(e) => setGrams(e.target.value)} />
      </div>
      {quotes.length === 0 ? (
        <p role="status" className="rp-hint" style={{ margin: 0, padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)" }}>
          ⚠ Nothing would be offered — this customer could not check out.
        </p>
      ) : (
        <ul className="rp-list" aria-label="Quotes a customer would see" style={{ margin: 0 }}>
          {quotes.map((q) => (
            <li key={q.id + q.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", gap: 12 }}>
              <span><strong>{q.name}</strong>{q.deliveryDays ? <span className="rp-hint"> · {q.type === "pickup" ? "ready in" : ""} {q.deliveryDays} days</span> : null}</span>
              <span className="rp-mono">{q.price === 0 ? "Free" : `$${q.price.toFixed(2)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

const numOrNull = (v: any) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));
function normalizeRate(r: any) {
  const type = r.type || "flat";
  return {
    ...r,
    name: String(r.name || "").trim(),
    type,
    enabled: r.enabled !== false,
    base: type === "free" || type === "pickup" ? 0 : Math.max(0, Number(r.base) || 0),
    additional: type === "flat" ? Math.max(0, Number(r.additional) || 0) : 0,
    perKg: type === "weight" ? Math.max(0, Number(r.perKg) || 0) : 0,
    percent: type === "percent" ? Math.max(0, Number(r.percent) || 0) : 0,
    handlingFee: numOrNull(r.handlingFee) ?? 0,
    freeOver: numOrNull(r.freeOver),
    minPrice: numOrNull(r.minPrice),
    maxPrice: numOrNull(r.maxPrice),
    minWeight: numOrNull(r.minWeight),
    maxWeight: numOrNull(r.maxWeight),
    minItems: numOrNull(r.minItems),
    maxItems: numOrNull(r.maxItems),
    note: String(r.note || "").trim(),
  };
}

/** Carrier & labels › live rates: one amount added to every live carrier price the shopper sees and pays. */
function LiveRateExtraField({ config, onSave }: { config: any; onSave: (extra: { enabled: boolean; amount: number }) => Promise<void> }) {
  const saved = config?.liveRateExtra || { enabled: false, amount: 0 };
  const [enabled, setEnabled] = useState<boolean>(saved.enabled === true);
  const [amount, setAmount] = useState<string>(saved.amount ? Number(saved.amount).toFixed(2) : "1.00");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setEnabled(saved.enabled === true);
    setAmount(saved.amount ? Number(saved.amount).toFixed(2) : "1.00");
  }, [saved.enabled, saved.amount]);
  const value = Number(amount);
  const invalid = amount.trim() === "" || !Number.isFinite(value) || value < 0 || value > MAX_LIVE_RATE_EXTRA;
  const dirty = enabled !== (saved.enabled === true) || (!invalid && Math.round(value * 100) !== Math.round((Number(saved.amount) || 0) * 100));
  const save = async () => {
    if (invalid || saving) return;
    setSaving(true);
    try {
      await onSave({ enabled, amount: Math.round(value * 100) / 100 });
      toast.success(enabled ? `Live rates now include an extra $${value.toFixed(2)}` : "Live rates now show the carrier's price");
    } catch (err: any) {
      toast.error(friendlyError(err, "save the extra amount on live rates"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rp-stack" style={{ gap: 8, paddingTop: 12, borderTop: "1px solid var(--rp-divider)" }}>
      <Toggle label="Add an extra amount to every live rate" checked={enabled} onChange={setEnabled} />
      <p className="rp-hint" style={{ margin: 0 }}>Shoppers pay it on top. Your labels don't.</p>
      {enabled && (
        <TextField label="Extra per order ($)" type="number" min={0} max={MAX_LIVE_RATE_EXTRA} step="0.01" inputMode="decimal" value={amount}
          error={invalid ? `Enter an amount from 0 to ${MAX_LIVE_RATE_EXTRA}.` : undefined}
          onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 160 }} />
      )}
      {dirty && <div><PrimaryButton size="sm" onClick={save} busy={saving} disabled={invalid}>Save extra amount</PrimaryButton></div>}
    </div>
  );
}

export function ShippingSettings({ profiles, profilesError = false, refreshProfiles, initialView = "overview", subTab, onSubTabChange }: any) {
  const localFulfillmentDraft = useLocalFulfillmentDraft();
  const [askConfirm, confirmNode] = useConfirm();
  const [books, setBooks] = useState<any[]>([]);
  const [booksError, setBooksError] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<any | null>(null);
  const [profileView, setProfileView] = useState<"zones" | "rules" | "books" | "test">("zones");
  const [shippingView, setShippingView] = useSubTab<"overview" | "profiles" | "carrier" | "local">(onSubTabChange ? "overview" : initialView, subTab, onSubTabChange);
  
  // Modals visibility
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  
  // Create profile dialog
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [shippoApiKey, setShippoApiKey] = useState("");
  const [showShippoApiKey, setShowShippoApiKey] = useState(false);
  const [shippoConfig, setShippoConfig] = useState<any | null>(null);
  const [shippoLoading, setShippoLoading] = useState(true);
  const [shippoSaving, setShippoSaving] = useState(false);
  const [carrierCountrySearch, setCarrierCountrySearch] = useState("");
  // Latest live-rate country list, updated synchronously on each click.
  const liveCountriesRef = useRef<string[] | null>(null);
  // Saves run one after another so the server always ends on the latest list.
  const liveSaveChain = useRef<Promise<unknown>>(Promise.resolve());
  const [shippoMessage, setShippoMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search/Filters
  const [productSearch, setProductSearch] = useState("");
  const [countrySearch, setCountrySearch] = useState("");

  // Sub-items active editing states
  const [activeZone, setActiveZone] = useState<any | null>(null);
  const [activeRate, setActiveRate] = useState<any | null>(null);
  const [parentZoneIdForRate, setParentZoneIdForRate] = useState<string | null>(null);

  // Checked products local state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  useEffect(() => {
    const initialize = async () => {
      await adminApi.migrateShippingProfiles();
      refreshProfiles();
      loadBooks();
      loadShippoConfig();
    };
    initialize();
  }, []);

  const loadShippoConfig = async () => {
    setShippoLoading(true);
    try {
      setShippoConfig(await adminApi.getShippoConfig());
    } catch (err: any) {
      setShippoMessage({ type: "error", text: friendlyError(err, "load the Shippo settings") });
    } finally {
      setShippoLoading(false);
    }
  };

  const handleSaveShippoApiKey = async () => {
    if (shippoSaving) return;
    const apiKey = shippoApiKey.trim();
    if (!apiKey) {
      setShippoMessage({ type: "error", text: "Enter your Shippo API key before saving." });
      return;
    }

    setShippoSaving(true);
    setShippoMessage(null);
    try {
      const config = await adminApi.saveShippoConfig(apiKey);
      setShippoConfig(config);
      setShippoApiKey("");
      setShowShippoApiKey(false);
      setShippoMessage({ type: "success", text: `Shippo accepted the key. Saved as a ${config?.mode === "test" ? "TEST" : "LIVE"} key.` });
    } catch (err: any) {
      setShippoMessage({ type: "error", text: friendlyError(err, "save the Shippo API key") });
    } finally {
      setShippoSaving(false);
    }
  };

  const loadBooks = async () => {
    try {
      const b = await adminApi.getAllBooks();
      setBooks(b);
      setBooksError(false);
    } catch (err) {
      console.error(err);
      setBooksError(true);
    }
  };

  const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
  const handleSelectProfile = (profile: any) => {
    setSelectedProfileId(profile.id);
    setEditingProfile(JSON.parse(JSON.stringify(profile)));
  };

  // Opens a just-made profile from the fresh list (so it isn't "unsaved"), then asks which books use it.
  const openNewProfile = async (created: any, message: string) => {
    const list = await refreshProfiles();
    const saved = (list || []).find((p: any) => p.id === created.id) || created;
    handleSelectProfile(saved);
    setShippingView("profiles");
    openProductModal(saved.id);
    toast.success(message);
  };
  const creatingRef = useRef(false);
  const handleCreateProfile = async (draft: any): Promise<boolean> => {
    // A double click must not create two profiles.
    if (creatingRef.current) return false;
    creatingRef.current = true;
    try {
      const created = await adminApi.createShippingProfile(draft);
      await openNewProfile(created, `“${draft.name}” created. Tick the books that use it.`);
      return true;
    } catch {
      toast.error("Couldn't create the shipping profile. Check your connection and try again.");
      return false;
    } finally {
      creatingRef.current = false;
    }
  };
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const handleDuplicateProfile = async (profile: any) => {
    if (duplicatingId) return;
    setDuplicatingId(profile.id);
    try {
      const draft = duplicateProfile(profile, newId, profiles.map((p: any) => p.name));
      const created = await adminApi.createShippingProfile(draft);
      await openNewProfile(created, `Copied as “${draft.name}”. Tick the books that use it; its prices are the same as “${profile.name}”.`);
    } catch {
      toast.error("Couldn't copy the shipping profile. Check your connection and try again.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (id === "general-profile") {
      toast.error("Cannot delete the General Shipping Profile.");
      return;
    }
    if (!(await askConfirm({ title: "Delete this shipping profile?", message: "All assigned products will revert to the General Profile.", confirmLabel: "Delete profile" }))) return;
    try {
      await adminApi.deleteShippingProfile(id);
      refreshProfiles();
      await loadBooks(); // its books moved to General — refresh counts and health
      setSelectedProfileId(null);
      setEditingProfile(null);
    } catch {
      toast.error("Couldn't delete the shipping profile. Nothing was changed; try again.");
    }
  };

  const [savingProfile, setSavingProfile] = useState(false);
  const handleSaveProfile = async () => {
    if (!editingProfile || savingProfile) return;
    // Check the edited profile the way the Overview does; blocking issues need an explicit yes.
    const blocking = summarizeShipping(profiles.map((p: any) => (p.id === editingProfile.id ? editingProfile : p)), books)
      .issues.filter((issue) => issue.profileId === editingProfile.id && issue.severity === "blocking");
    if (blocking.length && !(await askConfirm({
      title: `${blocking.length} blocking issue${blocking.length === 1 ? "" : "s"} — save anyway?`,
      message: `${blocking.map((i) => i.label).join(" · ")}. Some customers may not be able to check out until this is fixed.`,
      confirmLabel: "Save anyway",
    }))) return;
    setSavingProfile(true);
    try {
      await adminApi.updateShippingProfile(editingProfile.id, editingProfile);
      await refreshProfiles();
      toast.success(`“${editingProfile.name || "Profile"}” saved`);
      setSelectedProfileId(null);
      setEditingProfile(null);
    } catch {
      toast.error("Couldn't save the shipping profile — nothing was changed. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Product assignment helper
  const openProductModal = (profileId: string = editingProfile.id) => {
    const assigned = books
      .filter((b: any) => b.shippingProfileId === profileId)
      .map((b: any) => b.id);
    setSelectedProductIds(assigned);
    setProductSearch("");
    setIsProductModalOpen(true);
  };

  const [savingProducts, setSavingProducts] = useState(false);
  const handleSaveProducts = async () => {
    if (savingProducts) return;
    setSavingProducts(true);
    try {
      const wasAssigned = books.filter((b: any) => b.shippingProfileId === editingProfile.id).map((b: any) => b.id);
      const removed = wasAssigned.filter((id: string) => !selectedProductIds.includes(id));
      await adminApi.assignProductsToShippingProfile(editingProfile.id, selectedProductIds, removed);
      await loadBooks();
      refreshProfiles();
      setIsProductModalOpen(false);
    } catch {
      toast.error("Couldn't save which books use this profile. Nothing was changed; try again.");
    } finally {
      setSavingProducts(false);
    }
  };

  // Zones helper
  const openZoneModal = (zone: any = null) => {
    if (zone) {
      const copy = JSON.parse(JSON.stringify(zone));
      copy.countries = (copy.countries || []).map(countryName);
      setActiveZone(copy);
    } else {
      setActiveZone({
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        name: "",
        countries: [],
        rates: []
      });
    }
    setCountrySearch("");
    setIsZoneModalOpen(true);
  };

  const handleSaveZone = () => {
    // Older zones may be defined only by their region text (e.g. "Canada") — still valid.
    const hasGeography = activeZone.restOfWorld === true || activeZone.countries.length > 0 || (activeZone.continents || []).length > 0 || !!String(activeZone.region || "").trim();
    if (!activeZone.name.trim() || !hasGeography) {
      toast.error("Please enter a zone name and select at least one country (or make it the rest-of-world zone).");
      return;
    }
    // Checkout matches zones by ISO code: store codes, never display names.
    const saved = {
      ...activeZone,
      countries: activeZone.restOfWorld ? [] : toCountryCodes(activeZone.countries),
      continents: activeZone.restOfWorld ? [] : (activeZone.continents || []),
    };

    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const idx = zones.findIndex(z => z.id === saved.id);
      if (idx > -1) {
        zones[idx] = saved;
      } else {
        zones.push(saved);
      }
      return { ...prev, zones };
    });
    setIsZoneModalOpen(false);
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!(await askConfirm({ title: "Delete this zone?", message: "Its rates will be removed with it. Save the profile to apply.", confirmLabel: "Delete zone" }))) return;
    setEditingProfile((prev: any) => {
      const zones = (prev.zones || []).filter((z: any) => z.id !== zoneId);
      return { ...prev, zones };
    });
  };

  // Rates helper
  const openRateModal = (zoneId: string, rate: any = null) => {
    setParentZoneIdForRate(zoneId);
    if (rate) {
      setActiveRate(JSON.parse(JSON.stringify(rate)));
    } else {
      setActiveRate({
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        name: "Standard Shipping",
        base: 15,
        additional: 5,
        deliveryDays: "",
        type: "flat",
        enabled: true,
        minPrice: null,
        maxPrice: null
      });
    }
    setIsRateModalOpen(true);
  };

  const handleSaveRate = () => {
    if (!activeRate.name.trim()) {
      toast.error("Please enter a shipping rate name.");
      return;
    }

    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const zoneIdx = zones.findIndex(z => z.id === parentZoneIdForRate);
      if (zoneIdx === -1) return prev;

      const zone = { ...zones[zoneIdx] };
      const rates = [...(zone.rates || [])];
      const rateIdx = rates.findIndex(r => r.id === activeRate.id);

      const cleaned = normalizeRate(activeRate);
      if (rateIdx > -1) rates[rateIdx] = cleaned; else rates.push(cleaned);

      zone.rates = rates;
      zones[zoneIdx] = zone;
      return { ...prev, zones };
    });
    setIsRateModalOpen(false);
  };

  const handleDeleteRate = async (zoneId: string, rateId: string) => {
    if (!(await askConfirm({ title: "Delete this shipping rate?", message: "Save the profile to apply the change.", confirmLabel: "Delete rate" }))) return;
    setEditingProfile((prev: any) => {
      const zones = [...(prev.zones || [])];
      const zoneIdx = zones.findIndex(z => z.id === zoneId);
      if (zoneIdx === -1) return prev;

      const zone = { ...zones[zoneIdx] };
      zone.rates = (zone.rates || []).filter((r: any) => r.id !== rateId);
      zones[zoneIdx] = zone;
      return { ...prev, zones };
    });
  };

  const handleDuplicateRate = (zoneId: string, rate: any) => {
    setEditingProfile((prev: any) => {
      const zones = (prev.zones || []).map((z: any) => z.id !== zoneId ? z
        : { ...z, rates: [...(z.rates || []), { ...JSON.parse(JSON.stringify(rate)), id: newId(), name: `${rate.name} (copy)` }] });
      return { ...prev, zones };
    });
    toast.success("Rate copied — edit the copy, then save the profile.");
  };
  const handleDuplicateZone = (zone: any) => {
    setEditingProfile((prev: any) => ({
      ...prev,
      zones: [...(prev.zones || []), {
        ...JSON.parse(JSON.stringify(zone)), id: newId(), name: `${zone.name} (copy)`, countries: [], continents: [], restOfWorld: false,
        rates: (zone.rates || []).map((r: any) => ({ ...JSON.parse(JSON.stringify(r)), id: newId() })),
      }],
    }));
    toast.success("Zone copied with its rates — pick its countries, then save the profile.");
  };
  const handleAddStarterZones = () => {
    setEditingProfile((prev: any) => ({ ...prev, zones: [...(prev.zones || []), ...starterZones(newId)] }));
    toast.success("Starter zones added — adjust the prices, then save the profile.");
  };

  const getAssignedProducts = (profileId: string) => {
    return books.filter((b: any) => b.shippingProfileId === profileId);
  };

  const shippoConnected = !!shippoConfig?.configured;
  const shippingSummary = useMemo(() => summarizeShipping(profiles, books), [profiles, books]);
  // Every open problem, each fixed on one sub tab (shippingIssueTab).
  const shippingProblems = useMemo(() => [...shippingSummary.issues, ...carrierIssues(shippoConfig)], [shippingSummary, shippoConfig]);
  const profileProblems = useMemo(() => issuesForTab(shippingProblems, "profiles"), [shippingProblems]);
  const carrierProblems = useMemo(() => issuesForTab(shippingProblems, "carrier"), [shippingProblems]);
  const fixProfileIssue = (issue: ShippingIssue) => {
    const profile = profiles.find((item: any) => item.id === issue.profileId);
    if (!profile) return;
    // Back to profiles then lands on the Profiles tab.
    setShippingView("profiles");
    handleSelectProfile(profile);
  };
  const renderShippingProblems = (issues: ShippingIssue[], { showTab }: { showTab: boolean }) => (
    <ul className="rp-list" style={{ margin: -20 }} aria-label="Shipping configuration issues">
      {issues.map((issue) => {
        const tab: ShippingIssueTab = shippingIssueTab(issue);
        return (
          <li key={issue.id} style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
            <span>
              <strong>{issue.label}</strong>{issue.severity === "warning" && <>{" "}<StatusBadge tone="warning">Warning</StatusBadge></>}
              <span className="rp-hint" style={{ display: "block", marginTop: 3 }}>{issue.detail}</span>
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {issue.profileId && <SecondaryButton size="sm" onClick={() => fixProfileIssue(issue)}>Fix profile</SecondaryButton>}
              {showTab && <SecondaryButton size="sm" onClick={() => setShippingView(tab)}>Go to {SHIPPING_ISSUE_TAB_LABELS[tab]}</SecondaryButton>}
            </span>
          </li>
        );
      })}
    </ul>
  );
  const renderTabProblems = (issues: ShippingIssue[]) => issues.length === 0 ? null : (
    <SectionCard title={`${issues.length} problem${issues.length === 1 ? "" : "s"} to fix here`}>
      {renderShippingProblems(issues, { showTab: false })}
    </SectionCard>
  );
  const countriesAssignedElsewhere = activeZone
    ? assignedCountryNames(editingProfile?.zones || [], activeZone.id)
    : new Set<string>();
  const remainingCountries = activeZone
    ? remainingCountryNames(editingProfile?.zones || [], activeZone.id)
    : [];
  const countryGroups = groupedCountries(countrySearch);

  // Dialogs shared by the list and editor views
  const dialogs = editingProfile ? (
    <>
      <Dialog open={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} size="lg" badge="📦" title="Assign products"
        description={`Books that use the “${editingProfile.name}” shipping rates.`}
        footer={<>
          <SecondaryButton onClick={() => setIsProductModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveProducts} disabled={savingProducts}>{savingProducts ? "Saving…" : `Save assignments (${selectedProductIds.length})`}</PrimaryButton>
        </>}>
        <SearchField label="Search catalog" placeholder="Search catalog by title…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} data-autofocus />
        <ul className="rp-list" style={{ marginTop: 12, maxHeight: 360, overflowY: "auto", border: "1px solid var(--rp-border)" }} aria-label="Books">
          {books.filter((b) => String(b.title || "").toLowerCase().includes(productSearch.toLowerCase())).map((b) => {
            const isChecked = selectedProductIds.includes(b.id);
            const other = b.shippingProfileId && b.shippingProfileId !== editingProfile.id
              ? (profiles.find((pr: any) => pr.id === b.shippingProfileId)?.name || "another profile") : "";
            return (
              <li key={b.id} style={{ padding: "6px 12px" }}>
                <Checkbox label={b.title} checked={isChecked}
                  onChange={() => setSelectedProductIds((prev) => (isChecked ? prev.filter((id) => id !== b.id) : [...prev, b.id]))} />
                {other && <p className="rp-hint" style={{ margin: "0 0 4px 28px", color: "var(--rp-warning)" }}>⚠ Currently assigned to {other}; saving moves it here.</p>}
              </li>
            );
          })}
        </ul>
      </Dialog>

      <Dialog open={isZoneModalOpen && !!activeZone} onClose={() => setIsZoneModalOpen(false)} size="lg" badge="🌍" title="Shipping zone"
        description="Group countries and regions that share the same shipping rules."
        footer={<>
          <SecondaryButton onClick={() => setIsZoneModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveZone}>Save zone</PrimaryButton>
        </>}>
        {activeZone && (
          <div className="rp-stack" style={{ gap: 16 }}>
            <TextField label="Zone name" value={activeZone.name} placeholder="e.g. North America, Europe, Domestic…" data-autofocus
              onChange={(e) => setActiveZone({ ...activeZone, name: e.target.value })} />
            <Toggle label="Rest of world — everywhere not covered by another zone" checked={activeZone.restOfWorld === true}
              onChange={(on) => setActiveZone((prev: any) => ({ ...prev, restOfWorld: on, ...(on ? { countries: [], continents: [] } : {}) }))} />
            {!activeZone.restOfWorld && (<>
            <div>
              <div className="rp-sect">Regional presets</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CONTINENTS.map((continent) => (
                  <SecondaryButton key={continent} size="sm"
                    onClick={() => setActiveZone((prev: any) => ({
                      ...prev,
                      countries: Array.from(new Set([
                        ...prev.countries,
                        ...COUNTRIES.filter((country) => country.continent === continent && !countriesAssignedElsewhere.has(country.name)).map((country) => country.name),
                      ])),
                    }))}>
                    + {continent}
                  </SecondaryButton>
                ))}
                <PrimaryButton size="sm" disabled={remainingCountries.length === 0}
                  onClick={() => setActiveZone((prev: any) => ({ ...prev, countries: remainingCountries }))}>
                  Select all remaining worldwide ({remainingCountries.length})
                </PrimaryButton>
                <DestructiveButton size="sm" onClick={() => setActiveZone((prev: any) => ({ ...prev, countries: [] }))}>Clear selection</DestructiveButton>
              </div>
            </div>
            <SearchField label="Search countries" placeholder="Search countries…" value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} />
            <p className="rp-hint" role="status" style={{ margin: 0 }}>{activeZone.countries.length} countr{activeZone.countries.length === 1 ? "y" : "ies"} selected</p>
            <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--rp-border)", padding: "4px 12px" }}>
              {countryGroups.map(({ continent, countries }) => (
                <section key={continent} aria-labelledby={`shipping-continent-${continent.replace(/\s/g, "-")}`} style={{ padding: "10px 0" }}>
                  <div className="rp-sect" id={`shipping-continent-${continent.replace(/\s/g, "-")}`} style={{ marginBottom: 6 }}>{continent}</div>
                  <div style={{ display: "grid", gap: 0, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                    {countries.map((country) => {
                      const unavailable = countriesAssignedElsewhere.has(country.name);
                      return (
                        <Checkbox key={country.code}
                          label={`${country.name}${unavailable ? " — in another zone" : ""}`}
                          checked={activeZone.countries.includes(country.name)} disabled={unavailable}
                          onChange={() => setActiveZone((prev: any) => ({
                            ...prev,
                            countries: prev.countries.includes(country.name)
                              ? prev.countries.filter((name: string) => name !== country.name)
                              : [...prev.countries, country.name],
                          }))} />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
            </>)}
          </div>
        )}
      </Dialog>

      <Dialog open={isRateModalOpen && !!activeRate} onClose={() => setIsRateModalOpen(false)} badge="🚚" title="Shipping rate"
        description="What customers pay for this delivery option."
        footer={<>
          <SecondaryButton onClick={() => setIsRateModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveRate}>Save rate</PrimaryButton>
        </>}>
        {activeRate && (() => {
          const t = activeRate.type || "flat";
          const set = (k: string, v: any) => setActiveRate({ ...activeRate, [k]: v });
          const grid = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" } as const;
          const priced = t !== "free" && t !== "pickup";
          return (
          <div className="rp-stack" style={{ gap: 16 }}>
            <TextField label="Rate / service name" value={activeRate.name} placeholder="e.g. Standard shipping, Express delivery" data-autofocus
              onChange={(e) => set("name", e.target.value)} />
            <SelectField label="How is this rate priced?" value={t} onChange={(e) => set("type", e.target.value)}
              hint={RATE_TYPES.find((x) => x.id === t)?.help}>
              {RATE_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </SelectField>
            {priced && (
              <div style={grid}>
                <TextField label="Base rate ($)" type="number" min={0} step="0.01" value={activeRate.base} placeholder="15.00" onChange={(e) => set("base", e.target.value)} />
                {t === "flat" && <TextField label="Each additional item ($)" type="number" min={0} step="0.01" value={activeRate.additional} placeholder="5.00" onChange={(e) => set("additional", e.target.value)} />}
                {t === "weight" && <TextField label="Per kg ($)" type="number" min={0} step="0.01" value={activeRate.perKg ?? ""} placeholder="8.00" onChange={(e) => set("perKg", e.target.value)} />}
                {t === "percent" && <TextField label="% of book subtotal" type="number" min={0} step="0.1" value={activeRate.percent ?? ""} placeholder="10" onChange={(e) => set("percent", e.target.value)} />}
                <TextField label="Handling fee ($)" type="number" min={0} step="0.01" value={activeRate.handlingFee ?? ""} placeholder="0.00" hint="Added once per order." onChange={(e) => set("handlingFee", e.target.value)} />
              </div>
            )}
            <div style={grid}>
              <TextField label={t === "pickup" ? "Ready in (days)" : "Carrier transit after dispatch (days)"} value={activeRate.deliveryDays || ""} placeholder="Only enter a carrier-backed estimate" onChange={(e) => set("deliveryDays", e.target.value)} />
              {priced && <TextField label="Free when order reaches ($)" type="number" min={0} step="0.01" value={activeRate.freeOver ?? ""} placeholder="e.g. 75.00" hint="This rate becomes free at or above this total." onChange={(e) => set("freeOver", e.target.value)} />}
            </div>
            <fieldset style={{ border: "var(--rp-hair) solid var(--rp-divider)", padding: 12, margin: 0 }}>
              <legend className="rp-label" style={{ padding: "0 6px" }}>Only offer this rate when… (leave blank for always)</legend>
              <div style={grid}>
                <TextField label="Order total at least ($)" type="number" min={0} value={activeRate.minPrice ?? ""} onChange={(e) => set("minPrice", e.target.value)} />
                <TextField label="Order total at most ($)" type="number" min={0} value={activeRate.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value)} />
                <TextField label="Cart weight at least (g)" type="number" min={0} value={activeRate.minWeight ?? ""} onChange={(e) => set("minWeight", e.target.value)} />
                <TextField label="Cart weight at most (g)" type="number" min={0} value={activeRate.maxWeight ?? ""} onChange={(e) => set("maxWeight", e.target.value)} />
                <TextField label="Items in cart at least" type="number" min={0} value={activeRate.minItems ?? ""} onChange={(e) => set("minItems", e.target.value)} />
                <TextField label="Items in cart at most" type="number" min={0} value={activeRate.maxItems ?? ""} onChange={(e) => set("maxItems", e.target.value)} />
              </div>
            </fieldset>
            <Toggle label="Rate is active (customers can choose it)" checked={activeRate.enabled !== false} onChange={(v: boolean) => set("enabled", v)} />
          </div>
          );
        })()}
      </Dialog>
    </>
  ) : null;

  // An open profile with unsaved zone/rate edits blocks leaving Settings (settingsDirty.ts).
  const savedProfile = editingProfile ? profiles.find((p: any) => p.id === editingProfile.id) : null;
  const profileDirty = !!(savedProfile && editingProfile && JSON.stringify(savedProfile) !== JSON.stringify(editingProfile));
  useSettingsDirty("shipping-profile", profileDirty);

  // ─── Profiles list ──────────────────────────────────────────────────────────
  if (selectedProfileId === null || !editingProfile) {
    return (
      <div className="rp-stack">
        <Tabs variant="page" label="Shipping settings" value={shippingView} onChange={setShippingView} tabs={[
          { id: "overview", label: "Overview" },
          // Tab counts are open problems (none = no count); the profile count is on Overview.
          { id: "profiles", label: "Profiles", count: profileProblems.length || undefined },
          { id: "carrier", label: "Carrier & labels", count: carrierProblems.length || undefined },
          { id: "local", label: "Pickup & local delivery" },
        ]} />
        {shippingView === "local" && <LocalFulfillmentSettings draft={localFulfillmentDraft} />}
        {(shippingView === "overview" || shippingView === "profiles") && (profilesError || booksError) && (
          <ErrorState title="Couldn't load shipping details"
            description={profilesError ? "Your shipping profiles couldn't be read, so this page may look empty when it isn't. Check your connection and try again." : "Your catalog couldn't be read, so assigned-book counts and checks may be wrong. Check your connection and try again."}
            onRetry={() => { if (profilesError) refreshProfiles(); if (booksError) loadBooks(); }} />
        )}

        {shippingView === "overview" && (
          <>
            <section className="rp-kpi-grid" aria-label="Shipping in numbers">
              <MetricCard label="Profiles" value={shippingSummary.profileCount} footer={`${shippingSummary.assignedProductCount} books moved to a profile`} />
              <MetricCard label="Countries" value={shippingSummary.coveredCountryCount} footer={`${shippingSummary.zoneCount} zones · ${shippingSummary.rateCount} rates`} />
              <MetricCard label="Checkout" value={shippingProblems.length === 0 ? "Ready" : `${shippingProblems.length} issue${shippingProblems.length === 1 ? "" : "s"}`} footer={shippoConnected ? "Shippo connected" : "Flat rates only"} tone={shippingProblems.length > 0 ? "warn" : undefined} />
            </section>
            <SectionCard title="Checkout readiness">
              {shippingProblems.length === 0 ? (
                <div role="status" style={{ padding: 16, background: "var(--rp-success-tint)", border: "1px solid var(--rp-success)", color: "var(--rp-success)" }}>
                  <strong>✓ Shipping configuration is ready.</strong>
                  <p className="rp-hint" style={{ margin: "4px 0 0", color: "inherit" }}>Every profile has a zone and every zone has at least one rate.</p>
                </div>
              ) : renderShippingProblems(shippingProblems, { showTab: true })}
              <div className="rp-card-actions">
                <SecondaryButton onClick={() => setShippingView("carrier")}>{shippoConnected ? "Manage Shippo" : "Connect Shippo"}</SecondaryButton>
                <PrimaryButton onClick={() => setShippingView("profiles")}>Manage profiles</PrimaryButton>
              </div>
            </SectionCard>
          </>
        )}

        {shippingView === "carrier" && renderTabProblems(carrierProblems)}
        {shippingView === "carrier" && (
        <SectionCard title="Shippo connection" description="Address checks, live rates, labels."
          actions={!shippoLoading && <StatusBadge tone={!shippoConnected ? "warning" : shippoConfig?.mode === "test" ? "warning" : "success"}>{!shippoConnected ? "Not connected" : shippoConfig?.mode === "test" ? "Connected · TEST key" : shippoConfig?.mode === "live" ? "Connected · LIVE" : "Connected"}</StatusBadge>}>
          {!shippoLoading && !shippoConnected && (
            <p role="alert" style={{ margin: "0 0 16px", padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)", color: "var(--rp-warning)" }}>
              ⚠ Shippo isn't connected, so customer addresses aren't verified and live carrier rates are unavailable. Flat profile rates still apply.
            </p>
          )}
          {shippoConnected && shippoConfig?.mode === "test" && (
            <p role="alert" style={{ margin: "0 0 16px", padding: 12, background: "var(--rp-warning-tint)", border: "1px solid var(--rp-warning)", color: "var(--rp-warning)" }}>
              ⚠ This is a Shippo TEST key. Sandbox labels have no real postage and their tracking numbers never track, so labels bought now are marked TEST and can't be used on a real parcel. Save your live key (it starts with shippo_live_) before shipping real orders.
            </p>
          )}
          {shippoConnected && (
            <div className="rp-stack" style={{ gap: 12, marginBottom: 16 }}>
              <p className="rp-hint" style={{ margin: 0 }}>Active {shippoConfig.mode ? `${shippoConfig.mode} ` : ""}key ending in <span className="rp-mono">••••{shippoConfig.lastFour}</span>{shippoConfig.source === "environment" && " (Firebase secret)"}{shippoConfig.verifiedAt ? ` · checked with Shippo ${new Date(shippoConfig.verifiedAt).toLocaleDateString()}` : ""}</p>
              <Toggle label="Live carrier rates at checkout" checked={shippoConfig?.dynamicRatesEnabled ?? false}
                onChange={async (enabled) => {
                  try {
                    await adminApi.setShippoDynamicRates(enabled, shippoConfig?.dynamicRateCountries || []);
                    setShippoConfig((prev: any) => ({ ...prev, dynamicRatesEnabled: enabled }));
                    toast.success(enabled ? "Dynamic shipping rates enabled" : "Dynamic shipping rates disabled");
                  } catch (err: any) {
                    toast.error(friendlyError(err, "change live carrier rates"));
                  }
                }} />
              {shippoConfig?.dynamicRatesEnabled && (
                <div className="rp-stack" style={{ gap: 10, padding: 16, border: "1px solid var(--rp-border)", background: "var(--rp-canvas)" }}>
                  <div>
                    <strong>Countries using live rates</strong>
                    <p className="rp-hint" style={{ margin: "4px 0 0" }}>Ticked countries get live rates. The rest use your profiles.</p>
                  </div>
                  <SearchField label="Search live-rate countries" value={carrierCountrySearch} onChange={(e) => setCarrierCountrySearch(e.target.value)} placeholder="Search countries…" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, maxHeight: 260, overflowY: "auto", padding: 4 }}>
                    {COUNTRIES.filter((country) => country.name.toLowerCase().includes(carrierCountrySearch.trim().toLowerCase())).map((country) => {
                      const selected = (shippoConfig?.dynamicRateCountries || []).includes(country.code);
                      return (
                        <Checkbox key={country.code} label={country.name} checked={selected} onChange={async () => {
                          // Build from the latest list (not this render's), so quick clicks don't drop a country.
                          const current = liveCountriesRef.current ?? (shippoConfig?.dynamicRateCountries || []);
                          const countries = current.includes(country.code)
                            ? current.filter((code: string) => code !== country.code)
                            : [...current, country.code];
                          liveCountriesRef.current = countries;
                          setShippoConfig((prev: any) => ({ ...prev, dynamicRateCountries: countries }));
                          try {
                            const save = liveSaveChain.current.catch(() => {}).then(() => adminApi.setShippoDynamicRates(true, countries));
                            liveSaveChain.current = save;
                            await save;
                            toast.success(`${country.name} ${selected ? "removed from" : "added to"} live rates`);
                          } catch (err: any) {
                            liveCountriesRef.current = current;
                            setShippoConfig((prev: any) => ({ ...prev, dynamicRateCountries: current }));
                            toast.error(friendlyError(err, `update live rates for ${country.name}`));
                          }
                        }} />
                      );
                    })}
                  </div>
                  {(shippoConfig?.dynamicRateCountries || []).length === 0 && <p role="status" className="rp-hint" style={{ margin: 0 }}>None ticked. Everyone gets profile rates.</p>}
                  <LiveRateExtraField config={shippoConfig}
                    onSave={async (extra) => {
                      const countries = liveCountriesRef.current ?? (shippoConfig?.dynamicRateCountries || []);
                      const result = await adminApi.setShippoDynamicRates(true, countries, extra);
                      setShippoConfig((prev: any) => ({ ...prev, liveRateExtra: result?.liveRateExtra || extra }));
                    }} />
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 280px" }}>
              <TextField label="Shippo API key" type={showShippoApiKey ? "text" : "password"} value={shippoApiKey} autoComplete="new-password" spellCheck={false}
                placeholder={shippoConnected ? "Paste a new key to replace the current one" : "Paste your Shippo API key"}
                hint="Stored privately. Never shown again."
                onChange={(e) => { setShippoApiKey(e.target.value); if (shippoMessage) setShippoMessage(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !shippoSaving) handleSaveShippoApiKey(); }} />
            </div>
            <SecondaryButton onClick={() => setShowShippoApiKey((v) => !v)} aria-pressed={showShippoApiKey}>{showShippoApiKey ? "Hide key" : "Show key"}</SecondaryButton>
            <PrimaryButton onClick={handleSaveShippoApiKey} disabled={shippoSaving || !shippoApiKey.trim()}>{shippoSaving ? "Saving…" : "Save & sync"}</PrimaryButton>
          </div>
          {shippoMessage && (
            <p role="status" style={{ margin: "12px 0 0", color: shippoMessage.type === "success" ? "var(--rp-success)" : "var(--rp-danger)", fontWeight: 600 }}>
              {shippoMessage.type === "success" ? "✓ " : "✕ "}{shippoMessage.text}
            </p>
          )}
        </SectionCard>
        )}
        {shippingView === "carrier" && <AddressFinderCard />}

        {shippingView === "profiles" && (
        <>
        {renderTabProblems(profileProblems)}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <PrimaryButton size="sm" onClick={() => setIsCreatingProfile(true)}>+ Create profile</PrimaryButton>
        </div>

        <NewShippingProfileDialog open={isCreatingProfile} onClose={() => setIsCreatingProfile(false)} profiles={profiles} onCreate={handleCreateProfile} />

        {profiles.length === 0 && profilesError ? null : profiles.length === 0 ? (
          <EmptyState icon="🚚" title="No shipping profiles" description="Customers can't check out until a profile has a zone and a rate."
            action={<PrimaryButton onClick={() => setIsCreatingProfile(true)}>+ Create profile</PrimaryButton>} />
        ) : (
          <ul className="rp-list" style={{ margin: 0, border: "var(--rp-stroke) solid var(--rp-border-strong)", background: "var(--rp-surface)" }} aria-label="Shipping profiles">
            {profiles.map((p: any) => {
              const assigned = getAssignedProducts(p.id);
              const noRates = !(p.zones || []).some((z: any) => z.rates?.length);
              return (
                <li key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <button type="button" className="rp-wb-a" style={{ fontSize: "var(--rp-text-md, 16px)", overflowWrap: "anywhere", textAlign: "left" }} onClick={() => handleSelectProfile(p)}>{p.name || "Untitled profile"}</button>{" "}
                    {p.id === "general-profile" && <StatusBadge tone="primary">Default</StatusBadge>}{" "}
                    {noRates && <StatusBadge tone="warning">No rates yet</StatusBadge>}
                    <div className="rp-hint" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                      {profileSummary(p)} · {p.id === "general-profile" ? "all other books" : `${assigned.length} book${assigned.length === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                    <button type="button" className="rp-wb-a" onClick={() => handleSelectProfile(p)} aria-label={`Edit ${p.name || "profile"}`}>Edit</button>
                    <ActionMenu label={`More for ${p.name || "profile"}`} actions={[
                      { label: duplicatingId === p.id ? "Duplicating…" : "Duplicate", onSelect: () => { if (!duplicatingId) handleDuplicateProfile(p); } },
                      ...(p.id !== "general-profile" ? [{ label: "Delete", tone: "danger" as const, onSelect: () => handleDeleteProfile(p.id) }] : []),
                    ]} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        </>
        )}
        {confirmNode}
      </div>
    );
  }

  // ─── Profile editor (Masthead): name, sub tabs, one strip of figures ──────────
  const assignedBooks = getAssignedProducts(editingProfile.id);
  const zones = editingProfile.zones || [];
  const rateCount = zones.reduce((n: number, z: any) => n + (z.rates?.length || 0), 0);
  const countryCount = new Set(zones.flatMap((z: any) => z.countries || [])).size;
  const shipsEverywhere = zones.some((z: any) => z.restOfWorld);
  const isGeneral = editingProfile.id === "general-profile";
  const leaveEditor = async () => {
    const saved = profiles.find((p: any) => p.id === editingProfile?.id);
    const dirty = saved && JSON.stringify(saved) !== JSON.stringify(editingProfile);
    if (dirty && !(await askConfirm({ title: "Leave without saving?", message: "Your zone and rate changes to this profile haven't been saved.", confirmLabel: "Discard changes" }))) return;
    setSelectedProfileId(null); setEditingProfile(null); setProfileView("zones");
  };

  return (
    <div className="rp-stack">
      <header className="rp-wb-head">
        <div className="rp-wb-head-title">
          <div style={{ minWidth: 0 }}>
            <button type="button" className="rp-wb-a" style={{ fontSize: "var(--rp-text-sm)", marginBottom: 6 }} onClick={leaveEditor}>← Shipping profiles</button>
            <h2 className="rp-page-title rp-wb-h1" style={{ overflowWrap: "anywhere", fontSize: "var(--rp-text-2xl)" }}>{editingProfile.name || "Untitled profile"}</h2>
          </div>
          {isGeneral && <StatusBadge tone="primary">Default</StatusBadge>}
        </div>
        <Tabs variant="page" label="Profile" idPrefix="profile-" value={profileView} onChange={setProfileView} tabs={[
          { id: "zones", label: "Zones & prices" },
          { id: "rules", label: isGeneral ? "Rules" : "Name & rules" },
          { id: "books", label: "Books", count: isGeneral ? undefined : assignedBooks.length },
          { id: "test", label: "Test" },
        ]} />
        <section className="rp-kpi-grid" aria-label="This profile in numbers">
          <MetricCard label="Zones" value={zones.length} footer={zones.length ? "" : "Add one to ship"} tone={zones.length ? undefined : "warn"} />
          <MetricCard label="Rates" value={rateCount} footer={profileSummary({ zones }).split(" · ").pop()} tone={rateCount ? undefined : "warn"} />
          <MetricCard label="Countries" value={countryCount} footer={shipsEverywhere ? "plus everywhere else" : ""} />
          <MetricCard label="Books" value={isGeneral ? "All others" : assignedBooks.length} footer="" />
        </section>
      </header>

      <TabPanel tabId="profile-zones" active={profileView === "zones"}>
        <div className="rp-stack">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {zones.length === 0 && <SecondaryButton size="sm" onClick={handleAddStarterZones}>Add starter zones</SecondaryButton>}
            <PrimaryButton size="sm" onClick={() => openZoneModal()}>+ Add zone</PrimaryButton>
          </div>
          {zones.length === 0 ? (
            <EmptyState icon="🌍" title="No zones yet" description="Customers can't check out without a zone for their country." />
          ) : zones.map((z: any) => (
            <SectionCard key={z.id} title={z.name}
              actions={
                <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
                  <button type="button" className="rp-wb-a" onClick={() => openZoneModal(z)}>Edit zone</button>
                  <ActionMenu label={`More for zone ${z.name}`} actions={[
                    { label: "Copy zone", onSelect: () => handleDuplicateZone(z) },
                    { label: "Delete zone", tone: "danger", onSelect: () => handleDeleteZone(z.id) },
                  ]} />
                </span>
              }>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }} aria-label={`Countries in ${z.name}`}>
                {z.restOfWorld ? <StatusBadge>Everywhere else</StatusBadge> : z.countries.map((c: string) => <StatusBadge key={c}>{countryName(c)}</StatusBadge>)}
              </div>
              {(!z.rates || z.rates.length === 0) ? (
                <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-warning)" }}>⚠ No rates, so customers here can't check out.</p>
              ) : (
                <div className="rp-table-wrap" role="region" aria-label={`Rates for ${z.name}`} tabIndex={0} style={{ boxShadow: "none" }}>
                  <table className="rp-table">
                    <caption className="rp-sr-only">Shipping rates for {z.name}</caption>
                    <thead><tr><th scope="col">Rate</th><th scope="col">Price</th><th scope="col">Offered when</th><th scope="col">Delivery</th><th scope="col"><span className="rp-sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {z.rates.map((r: any) => (
                        <tr key={r.id} style={r.enabled === false ? { opacity: 0.55 } : undefined}>
                          <td className="rp-lead">{r.name}{r.enabled === false && <> <StatusBadge>Off</StatusBadge></>}</td>
                          <td>{describeRatePrice(r)}</td>
                          <td>{describeRateConditions(r) || "Always"}</td>
                          <td>{r.type === "pickup" ? "Pickup" : r.deliveryDays ? `${r.deliveryDays} days` : "—"}</td>
                          <td>
                            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                              <button type="button" className="rp-wb-a" onClick={() => openRateModal(z.id, r)} aria-label={`Edit rate ${r.name}`}>Edit</button>
                              <ActionMenu label={`More for rate ${r.name}`} actions={[
                                { label: "Copy rate", onSelect: () => handleDuplicateRate(z.id, r) },
                                { label: "Delete rate", tone: "danger", onSelect: () => handleDeleteRate(z.id, r.id) },
                              ]} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 10 }}><button type="button" className="rp-wb-a" onClick={() => openRateModal(z.id)}>+ Add rate</button></div>
            </SectionCard>
          ))}
        </div>
      </TabPanel>

      <TabPanel tabId="profile-rules" active={profileView === "rules"}>
        <SectionCard>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {!isGeneral && (
              <TextField label="Profile name" value={editingProfile.name} onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })} />
            )}
            <TextField label="Free shipping over ($)" type="number" min={0} step="0.01" placeholder="None"
              hint="Every rate here becomes free at this order total."
              value={editingProfile.freeShippingOver ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, freeShippingOver: e.target.value === "" ? null : Number(e.target.value) })} />
            <TextField label="Packing fee per order ($)" type="number" min={0} step="0.01" placeholder="0.00"
              value={editingProfile.handlingFee ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, handlingFee: e.target.value === "" ? null : Number(e.target.value) })} />
            <TextField label="Weight of a book with none set (g)" type="number" min={0} placeholder="e.g. 350"
              value={editingProfile.defaultItemWeightG ?? ""} onChange={(e) => setEditingProfile({ ...editingProfile, defaultItemWeightG: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
        </SectionCard>
      </TabPanel>

      <TabPanel tabId="profile-books" active={profileView === "books"}>
        <div className="rp-stack">
          {!isGeneral && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <PrimaryButton size="sm" onClick={() => openProductModal()}>Choose books ({assignedBooks.length})</PrimaryButton>
            </div>
          )}
          {isGeneral ? (
            <p className="rp-hint" style={{ margin: 0 }}>Every book not moved to another profile ships with these prices.</p>
          ) : assignedBooks.length === 0 ? (
            <EmptyState icon="📦" title="No books yet" description="Books you choose here use this profile's prices." />
          ) : (
            <ul className="rp-list" style={{ margin: 0, border: "var(--rp-hair) solid var(--rp-border)" }} aria-label="Books that use this profile">
              {assignedBooks.map((b: any) => <li key={b.id} style={{ padding: "10px 14px", overflowWrap: "anywhere" }}>{b.title}</li>)}
            </ul>
          )}
        </div>
      </TabPanel>

      <TabPanel tabId="profile-test" active={profileView === "test"}>
        <RateTester profile={editingProfile} />
      </TabPanel>

      <SaveBar dirty={profileDirty} saving={savingProfile} message={`Unsaved changes to “${editingProfile.name || "this profile"}”.`}
        onSave={handleSaveProfile} onDiscard={() => { if (savedProfile) setEditingProfile(JSON.parse(JSON.stringify(savedProfile))); }} />

      {dialogs}
      {confirmNode}
    </div>
  );
}

function TestSaleWalkthrough({ payments, onOpenOrders, onOpenNotifications, onOpenMethods }: any) {
  const [data, setData] = useState<{ orders: any[]; webhook: any; emailLog: any[] } | null>(null);
  // Reads that failed: their steps are unknown, not "not done".
  const [failed, setFailed] = useState<string[]>([]);
  const load = async () => {
    const missed: string[] = [];
    const soft = <T,>(p: Promise<T>, label: string, fallback: T) => p.catch(() => { missed.push(label); return fallback; });
    const [orders, webhook, emailLog] = await Promise.all([
      soft(adminApi.getOrders(50), "orders", [] as any[]), soft(adminApi.getStripeWebhookStatus(), "Stripe webhook status", null as any), soft(adminApi.getRecentEmailLog(100), "email log", [] as any[]),
    ]);
    setFailed(missed);
    setData({ orders, webhook, emailLog });
  };
  useEffect(() => { load(); }, []);
  const steps = testSaleSteps({ payments, ...(data || { orders: [], webhook: null, emailLog: [] }) });
  const doneCount = steps.filter((st) => st.done).length;
  const go = (link: string, id: string) => {
    if (link === "orders") onOpenOrders?.();
    // The Stripe test key and webhook check sit on the Ways to pay sub tab; test mode is on this one.
    else if (link === "payments" && (id === "testKey" || id === "webhook")) onOpenMethods?.();
    else if (link === "notifications") onOpenNotifications?.();
    else if (link === "storefront") window.open(`${window.location.origin}${import.meta.env.BASE_URL || "/"}`, "_blank", "noopener");
    else document.getElementById("payments-top")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <SectionCard title="Test sale walkthrough" description={`One full rehearsal before real money · ${data ? `${doneCount} of ${steps.length} done` : "checking…"}`}
      actions={<SecondaryButton size="sm" onClick={load}>Check again</SecondaryButton>}>
      {failed.length > 0 && <p role="alert" className="rp-hint" style={{ marginTop: 0, color: "var(--rp-danger)" }}>Couldn't read the {failed.join(", ")}. Check again.</p>}
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }} aria-label="Test sale steps">
        {steps.map((st, i) => (
          <li key={st.id} style={{ display: "flex", flexWrap: "wrap", gap: "8px 12px", alignItems: "flex-start", padding: "10px 0", borderTop: i ? "1px solid var(--rp-divider)" : undefined }}>
            <span className="rp-todo-mark" data-done={st.done || undefined} aria-label={st.done ? "Done" : "To do"} role="img">{st.done ? "✓" : ""}</span>
            <span style={{ flex: "1 1 220px", minWidth: 0 }}><strong style={st.done ? { color: "var(--rp-text-muted)" } : undefined}>{st.label}</strong><span className="rp-hint" style={{ display: "block" }}>{st.howTo}</span></span>
            {!st.done && <button type="button" className="rp-wb-a" onClick={() => go(st.link, st.id)}>{st.link === "orders" ? "Open Orders" : st.link === "notifications" ? "Open Email sender" : st.link === "storefront" ? "Open shop ↗" : "Show me"}</button>}
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function PaymentsSettings({ settings, setSettings, originalSettings, setOriginalSettings, hasChanges, saveSection, savingSection, onOpenShipping, onOpenOrders, onOpenNotifications, subTab, onSubTabChange }: any) {
  const [askConfirm, confirmNode] = useConfirm();
  const stripe = settings.payments?.stripe || {};
  const paypal = settings.payments?.paypal || {};
  const testMode = settings.payments?.testMode || false;
  const manualMethods = settings.payments?.manualMethods || [];
  const footerBadges = settings.payments?.footerBadges || [];

  // Manual payment modal state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);
  const [methodName, setMethodName] = useState("");
  const [methodInstructions, setMethodInstructions] = useState("");
  const [methodType, setMethodType] = useState<"bank" | "cod" | "custom">("bank");
  const [methodEnabled, setMethodEnabled] = useState(true);

  // Bumped on save/discard so the write-only key boxes clear with the state.
  const [secretFieldsKey, setSecretFieldsKey] = useState(0);
  const [removingKey, setRemovingKey] = useState<null | "live" | "test">(null);
  const [registeringDomain, setRegisteringDomain] = useState(false);
  const removeStoredKey = async (mode: "live" | "test") => {
    if (!(await askConfirm({ title: `Remove the stored ${mode} secret key?`, message: mode === "live" ? "Live checkout will use the key set in Firebase Functions (if any) until you enter a new one." : "Test (sandbox) checkout won't work until you enter a new test key.", confirmLabel: "Remove key" }))) return;
    setRemovingKey(mode);
    try {
      await adminApi.removeStripeSecretKey(mode);
      const flag = mode === "live" ? "secretKeyStored" : "testSecretKeyStored";
      const field = mode === "live" ? "secretKey" : "testSecretKey";
      const patchOf = (prev: any) => ({ ...prev, payments: { ...prev?.payments, stripe: { ...prev?.payments?.stripe, [flag]: false, [field]: "" } } });
      setSettings(patchOf);
      setOriginalSettings?.(patchOf);
      setSecretFieldsKey((k) => k + 1);
      toast.success(`Stored ${mode} secret key removed`);
    } catch (err: any) {
      toast.error(friendlyError(err, "remove the key"));
    } finally {
      setRemovingKey(null);
    }
  };

  const [removingPaypal, setRemovingPaypal] = useState<null | "live" | "test">(null);
  const removePaypalSecret = async (mode: "live" | "test") => {
    if (!(await askConfirm({ title: `Remove the stored ${mode} PayPal client secret?`, message: mode === "live" ? "Live PayPal will use the credentials set in Firebase Functions (if any) until you enter a new secret." : "Test (sandbox) PayPal won't work until you enter a new sandbox secret.", confirmLabel: "Remove secret" }))) return;
    setRemovingPaypal(mode);
    try {
      await adminApi.removePaypalSecret(mode);
      const flag = mode === "live" ? "clientSecretStored" : "testClientSecretStored";
      const field = mode === "live" ? "clientSecret" : "testClientSecret";
      const patchOf = (prev: any) => ({ ...prev, payments: { ...prev?.payments, paypal: { ...prev?.payments?.paypal, [flag]: false, [field]: "" } } });
      setSettings(patchOf);
      setOriginalSettings?.(patchOf);
      setSecretFieldsKey((k) => k + 1);
      toast.success(`Stored ${mode} PayPal secret removed`);
    } catch (err: any) {
      toast.error(friendlyError(err, "remove the secret"));
    } finally {
      setRemovingPaypal(null);
    }
  };

  const updateStripe = (patch: any) => {
    setSettings({
      ...settings,
      payments: { ...settings.payments, stripe: { ...stripe, ...patch } }
    });
  };

  const updatePaypal = (patch: any) => {
    setSettings({
      ...settings,
      payments: { ...settings.payments, paypal: { ...paypal, ...patch } }
    });
  };

  const updateTestMode = async (val: boolean) => {
    const ok = await askConfirm(val
      ? { title: "Switch on test mode?", message: "Once you save, checkout only accepts Stripe and PayPal test payments (card 4242 4242 4242 4242). Real cards are refused and new orders are marked as tests that never touch stock or revenue. An alert shows on every admin page while it's on.", confirmLabel: "Use test mode" }
      : { title: "Switch off test mode?", message: "Once you save, checkout takes real payments with your live keys. Make sure the live publishable and secret keys are filled in and the webhook check passes.", confirmLabel: "Take real payments" });
    if (!ok) return;
    setSettings({
      ...settings,
      payments: { ...settings.payments, testMode: val }
    });
  };

  const openAddMethod = (type: "bank" | "cod" | "custom") => {
    let defaultName = "";
    let defaultInstructions = "";
    if (type === "bank") {
      defaultName = "Bank Deposit / e-Transfer";
      defaultInstructions = `Please send your Interac e-Transfer to ${settings.info?.email || "lyricalmyricalbooks@gmail.com"}. Use your order number as the transaction message.`;
    } else if (type === "cod") {
      defaultName = "Cash on Delivery (COD)";
      defaultInstructions = "Please prepare the exact amount of cash for your order. Our delivery agent will collect it upon delivery.";
    } else {
      defaultName = "Custom Payment Method";
      defaultInstructions = "Please follow these instructions to complete payment for your order.";
    }
    setEditingMethod(null);
    setMethodType(type);
    setMethodName(defaultName);
    setMethodInstructions(defaultInstructions);
    // Cash on delivery starts off: switch it on once you're ready to collect cash.
    setMethodEnabled(type !== "cod");
    setIsManualModalOpen(true);
  };

  const openEditMethod = (method: any) => {
    setEditingMethod(method);
    setMethodType(method.type);
    setMethodName(method.name);
    setMethodInstructions(method.instructions);
    setMethodEnabled(method.enabled);
    setIsManualModalOpen(true);
  };

  const handleSaveMethod = () => {
    if (!methodName.trim()) {
      toast.error("Please enter a payment method name.");
      return;
    }

    let updatedMethods = [];
    if (editingMethod) {
      updatedMethods = manualMethods.map((m: any) =>
        m.id === editingMethod.id
          ? { ...m, name: methodName, instructions: methodInstructions, enabled: methodEnabled }
          : m
      );
    } else {
      const newMethod = {
        id: `manual_${Date.now()}`,
        type: methodType,
        name: methodName,
        instructions: methodInstructions,
        enabled: methodEnabled
      };
      updatedMethods = [...manualMethods, newMethod];
    }

    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
    setIsManualModalOpen(false);
  };

  const handleDeleteMethod = (id: string) => {
    const updatedMethods = manualMethods.filter((m: any) => m.id !== id);
    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
  };

  const handleToggleMethodStatus = (id: string, enabled: boolean) => {
    const updatedMethods = manualMethods.map((m: any) =>
      m.id === id ? { ...m, enabled } : m
    );
    setSettings({
      ...settings,
      payments: {
        ...settings.payments,
        manualMethods: updatedMethods
      }
    });
  };

  const enabledManual = manualMethods.filter((m: any) => m.enabled);
  const dirty = hasChanges("payments");
  useSettingsDirty("payments", dirty);
  const stripeLive = !!stripe.connected;
  const paypalLive = !!paypal.connected;
  const secretStored = !!(stripe.secretKey || stripe.testSecretKey || stripe.secretKeyStored || stripe.testSecretKeyStored);
  const paymentIssues = useMemo(() => paymentHealth(settings.payments), [settings.payments]);

  const blockingCount = paymentIssues.filter((i) => i.severity === "blocking").length;
  const [view, setView] = useSubTab<string>("pay-status", subTab, onSubTabChange);
  const tabs: SettingsTab[] = [
    { id: "pay-status", title: "Ready to take payments?", count: blockingCount },
    { id: "pay-methods", title: "Ways to pay" },
    { id: "pay-more", title: "On the shop & related settings" },
  ];

  const removeMethod = async (m: any) => {
    if (!(await askConfirm({ title: "Delete this payment method?", message: `“${m.name}” will no longer be offered at checkout once you save.`, confirmLabel: "Delete method" }))) return;
    handleDeleteMethod(m.id);
  };

  return (
    <div className="rp-stack" id="payments-top">
      <SettingsTabs label="Payment settings" tabs={tabs} value={view} onChange={setView} />

      <SettingsGroup id="pay-status" active={view === "pay-status"}>
        <SettingsAnchor id="pay-overview">
          <SectionCard title="Payment overview" description="What works right now.">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <StatusBadge tone={testMode ? "warning" : "success"}>{testMode ? "Test mode — no real charges" : "Live mode"}</StatusBadge>
              <StatusBadge tone={stripeLive ? "success" : "neutral"}>Stripe {stripeLive ? "on" : "off"}</StatusBadge>
              <StatusBadge tone={paypalLive ? "success" : "neutral"}>PayPal {paypalLive ? "on" : "off"}</StatusBadge>
              <StatusBadge tone={enabledManual.length ? "info" : "neutral"}>{enabledManual.length} manual method{enabledManual.length === 1 ? "" : "s"}</StatusBadge>
            </div>
            {paymentIssues.length === 0 ? (
              <p role="status" style={{ padding: 12, background: "var(--rp-success-tint)", color: "var(--rp-success)", border: "1px solid var(--rp-success)" }}><strong>✓ Payment configuration is launch-ready.</strong></p>
            ) : (
              <ul className="rp-list" aria-label="Payment readiness issues" style={{ marginTop: 16, border: "1px solid var(--rp-border)" }}>
                {paymentIssues.map((issue) => <li key={issue.id} style={{ padding: 12 }}><StatusBadge tone={issue.severity === "blocking" ? "danger" : "warning"}>{issue.severity === "blocking" ? "Must fix" : "Worth checking"}</StatusBadge> <strong style={{ marginLeft: 8 }}>{issue.label}</strong><span className="rp-hint" style={{ display: "block", marginTop: 4 }}>{issue.detail}</span></li>)}
              </ul>
            )}
            <div className="rp-card-actions">
              <Toggle label="Test (sandbox) mode" checked={!!testMode} onChange={updateTestMode} />
              <span className="rp-hint">Test charges only. Orders marked test.</span>
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="pay-test">
          <TestSaleWalkthrough payments={originalSettings?.payments} onOpenOrders={onOpenOrders} onOpenNotifications={onOpenNotifications} onOpenMethods={() => setView("pay-methods")} />
        </SettingsAnchor>
      </SettingsGroup>

      <SettingsGroup id="pay-methods" active={view === "pay-methods"}>
        <SettingsAnchor id="pay-stripe">
          <SectionCard title="Stripe" description="Cards, Apple Pay, Google Pay."
            actions={<SecondaryButton size="sm" onClick={() => window.open("https://dashboard.stripe.com", "_blank", "noopener")}>Stripe dashboard ↗</SecondaryButton>}>
            <div className="rp-stack" style={{ gap: 20 }}>
              <Toggle label="Stripe checkout" checked={!!stripe.connected} onChange={(v) => updateStripe({ connected: v })} />
              {stripe.connected && (
                <>
                  {secretStored && (
                    <div style={{ padding: 16, background: "var(--rp-warning-tint)" }}>
                      <strong>🔒 Secret key stored privately.</strong>{" "}
                      Secret keys are kept in an admin-only store the storefront cannot read.
                      {stripe.keysWerePublic && " A key was once saved where the storefront could read it and has since been moved — rotate it in the Stripe Dashboard to be safe."}
                    </div>
                  )}
                  <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                    <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 0.75 : 1 }}>
                      <div className="rp-sect">Live keys {!testMode && "· in use"}</div>
                      <div className="rp-stack" style={{ gap: 12 }}>
                        <TextField label="Publishable key" placeholder="pk_live_…" spellCheck={false} value={stripe.publicKey || ""} onChange={(e) => updateStripe({ publicKey: e.target.value })} />
                        <SecretField key={`live-${secretFieldsKey}`} label="Secret key" placeholder="sk_live_…" stored={!!stripe.secretKeyStored}
                          validate={(v) => stripeSecretKeyProblem(v, "live")} onCommit={(v) => updateStripe({ secretKey: v })}
                          onRemove={stripe.secretKeyStored ? () => removeStoredKey("live") : undefined} removing={removingKey === "live"} />
                      </div>
                    </div>
                    <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 1 : 0.75 }}>
                      <div className="rp-sect">Test keys {testMode && "· in use"}</div>
                      <div className="rp-stack" style={{ gap: 12 }}>
                        <TextField label="Test publishable key" placeholder="pk_test_…" spellCheck={false} value={stripe.testPublicKey || ""} onChange={(e) => updateStripe({ testPublicKey: e.target.value })} />
                        <SecretField key={`test-${secretFieldsKey}`} label="Test secret key" placeholder="sk_test_…" stored={!!stripe.testSecretKeyStored}
                          validate={(v) => stripeSecretKeyProblem(v, "test")} onCommit={(v) => updateStripe({ testSecretKey: v })}
                          onRemove={stripe.testSecretKeyStored ? () => removeStoredKey("test") : undefined} removing={removingKey === "test"} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 4 }}>
                    <Toggle label="Apple Pay" checked={!!stripe.applePay} onChange={(v) => updateStripe({ applePay: v })} />
                    <Toggle label="Google Pay" checked={!!stripe.googlePay} onChange={(v) => updateStripe({ googlePay: v })} />
                  </div>
                  <div className="rp-card" style={{ padding: 16, boxShadow: "none", background: "var(--rp-surface-sunken)" }}>
                    <div className="rp-sect">Apple Pay &amp; Google Pay</div>
                    <p className="rp-hint" style={{ marginTop: 0 }}>
                      Wallet buttons only show in the card form once this site's address is registered with Stripe. Save your Stripe keys first.
                    </p>
                    <SecondaryButton size="sm" disabled={registeringDomain} onClick={async () => {
                      if (registeringDomain) return;
                      setRegisteringDomain(true);
                      try {
                        const r = await adminApi.registerStripePaymentDomain(window.location.origin);
                        toast.success(`${r.domain}: Apple Pay ${r.applePay}, Google Pay ${r.googlePay}`);
                      } catch (err: any) {
                        toast.error(friendlyError(err, "register this site with Stripe"));
                      } finally {
                        setRegisteringDomain(false);
                      }
                    }}>{registeringDomain ? "Registering…" : "Register this site with Stripe"}</SecondaryButton>
                  </div>
                  <StripeWebhookHealth unsaved={dirty} />
                </>
              )}
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="pay-paypal">
          <SectionCard title="PayPal">
            <div className="rp-stack" style={{ gap: 20 }}>
              <Toggle label="PayPal checkout" checked={!!paypal.connected} onChange={(v) => updatePaypal({ connected: v })} />
              {paypal.connected && (
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
                  <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 0.75 : 1 }}>
                    <div className="rp-sect">Live credentials {!testMode && "· in use"}</div>
                    <div className="rp-stack" style={{ gap: 12 }}>
                      <TextField label="Live client ID" placeholder="Client ID…" spellCheck={false} value={paypal.clientId || ""} onChange={(e) => updatePaypal({ clientId: e.target.value })} />
                      <SecretField key={`pp-live-${secretFieldsKey}`} label="Live client secret" placeholder="Client secret…" stored={!!paypal.clientSecretStored}
                        onCommit={(v) => updatePaypal({ clientSecret: v })}
                        onRemove={paypal.clientSecretStored ? () => removePaypalSecret("live") : undefined} removing={removingPaypal === "live"} />
                      <p className="rp-hint" style={{ margin: 0 }}>Blank falls back to the server's credentials.</p>
                    </div>
                  </div>
                  <div className="rp-card" style={{ padding: 16, boxShadow: "none", opacity: testMode ? 1 : 0.75 }}>
                    <div className="rp-sect">Test (sandbox) credentials {testMode && "· in use"}</div>
                    <div className="rp-stack" style={{ gap: 12 }}>
                      <TextField label="Test client ID" placeholder="Sandbox client ID…" spellCheck={false} value={paypal.testClientId || ""} onChange={(e) => updatePaypal({ testClientId: e.target.value })} />
                      <SecretField key={`pp-test-${secretFieldsKey}`} label="Test client secret" placeholder="Sandbox client secret…" stored={!!paypal.testClientSecretStored}
                        onCommit={(v) => updatePaypal({ testClientSecret: v })}
                        onRemove={paypal.testClientSecretStored ? () => removePaypalSecret("test") : undefined} removing={removingPaypal === "test"} />
                      <p className="rp-hint" style={{ margin: 0 }}>Needs both sandbox values, or PayPal stays off in test mode.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="pay-manual">
          <SectionCard title="Manual payment methods" description="e-Transfer, cash, your own terms."
            actions={
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <SecondaryButton size="sm" onClick={() => openAddMethod("bank")}>+ e-Transfer</SecondaryButton>
                <SecondaryButton size="sm" onClick={() => openAddMethod("cod")}>+ Cash on delivery</SecondaryButton>
                <SecondaryButton size="sm" onClick={() => openAddMethod("custom")}>+ Custom</SecondaryButton>
              </div>
            }>
            {manualMethods.length === 0 ? (
              <EmptyState icon="💳" title="No manual methods" description="For shoppers who skip the card." />
            ) : (
              <ul className="rp-list" style={{ margin: -20 }} aria-label="Manual payment methods">
                {manualMethods.map((method: any) => (
                  <li key={method.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                      <strong>{method.name}</strong> <StatusBadge tone={method.enabled ? "success" : "neutral"}>{method.enabled ? "Enabled" : "Off"}</StatusBadge>
                      <p className="rp-hint" style={{ margin: "4px 0 0", overflowWrap: "anywhere" }}>{method.instructions}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Toggle label={`${method.name} enabled`} checked={!!method.enabled} onChange={(v) => handleToggleMethodStatus(method.id, v)} />
                      <SecondaryButton size="sm" onClick={() => openEditMethod(method)} aria-label={`Edit ${method.name}`}>Edit</SecondaryButton>
                      <DestructiveButton size="sm" onClick={() => removeMethod(method)} aria-label={`Delete ${method.name}`}>Delete</DestructiveButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </SettingsAnchor>
      </SettingsGroup>

      <SettingsGroup id="pay-more" active={view === "pay-more"}>
        <SettingsAnchor id="pay-icons">
          <SectionCard title="Footer payment icons" description="Studio's Payment icons win once set."
            actions={<SecondaryButton size="sm" onClick={() => { window.location.hash = studioHash({ leftTab: "style" }); }}>Open Studio</SecondaryButton>}>
            <div style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              {[
                { id: "visa", label: "Visa" }, { id: "mastercard", label: "Mastercard" }, { id: "amex", label: "American Express" },
                { id: "paypal", label: "PayPal" }, { id: "applepay", label: "Apple Pay" }, { id: "googlepay", label: "Google Pay" },
                // Afterpay / Klarna aren't offered at checkout; shown only if an older save picked them.
                ...[{ id: "afterpay", label: "Afterpay" }, { id: "klarna", label: "Klarna" }].filter((b) => footerBadges.includes(b.id)),
              ].map((badge) => (
                <Checkbox key={badge.id} label={badge.label} checked={footerBadges.includes(badge.id)}
                  onChange={() => {
                    const next = footerBadges.includes(badge.id) ? footerBadges.filter((b: string) => b !== badge.id) : [...footerBadges, badge.id];
                    setSettings({ ...settings, payments: { ...settings.payments, footerBadges: next } });
                  }} />
              ))}
            </div>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="pay-currency">
          <SectionCard title="Currency">
            <p className="rp-hint" style={{ margin: 0 }}>Charged in CA$. Other currencies are display only.</p>
          </SectionCard>
        </SettingsAnchor>
        <SettingsAnchor id="pay-shippo">
          <SectionCard title="Shippo" description="Lives with your shipping rules."
            actions={<SecondaryButton size="sm" onClick={() => onOpenShipping?.()}>Open Shipping › Carrier &amp; labels</SecondaryButton>}>
            <p className="rp-hint" style={{ margin: 0 }}>Key and live-rate countries, in one place.</p>
          </SectionCard>
        </SettingsAnchor>
      </SettingsGroup>

      <SaveBar dirty={dirty} saving={savingSection === "payments"} message="You have unsaved payment settings."
        onSave={async () => { if (await saveSection("payments", { payments: settings.payments })) { setSecretFieldsKey((k) => k + 1); toast.success("Payment settings saved"); } }}
        onDiscard={() => { setSettings({ ...settings, payments: JSON.parse(JSON.stringify(originalSettings?.payments ?? {})) }); setSecretFieldsKey((k) => k + 1); }} />

      <Dialog open={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} title={editingMethod ? "Edit payment method" : "Add payment method"} badge="💳"
        footer={<>
          <SecondaryButton onClick={() => setIsManualModalOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSaveMethod}>{editingMethod ? "Update method" : "Add method"}</PrimaryButton>
        </>}>
        <div className="rp-stack" style={{ gap: 16 }}>
          <TextField label="Payment method title" value={methodName} placeholder="e.g. Bank deposit, Interac e-Transfer" onChange={(e) => setMethodName(e.target.value)} data-autofocus />
          <TextArea label="Customer instructions" rows={5} value={methodInstructions} onChange={(e) => setMethodInstructions(e.target.value)}
            placeholder="e.g. Send your e-Transfer to payments@example.com and use your order number as the message." hint="Shown to the customer after they place the order." />
          <Toggle label="Offer this method at checkout" checked={methodEnabled} onChange={setMethodEnabled} />
        </div>
      </Dialog>
      {confirmNode}
    </div>
  );
}

/** Write-only field for secrets: never echoes the stored value back into the page. */
// Write-only key box. Every edit is passed up (clearing the box cancels the change),
// a key that fails `validate` is never passed up, and a stored key can be removed.
export function SecretField({ label, placeholder, stored, onCommit, validate, onRemove, removing }: {
  label: string; placeholder: string; stored: boolean; onCommit: (v: string) => void;
  validate?: (v: string) => string; onRemove?: () => void; removing?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const problem = validate ? validate(draft) : "";
  return (
    <div>
      <TextField label={label} type="password" autoComplete="new-password" spellCheck={false} value={draft} placeholder={stored ? "Stored — enter a new key to replace it" : placeholder}
        error={problem || undefined}
        hint={!problem && stored ? "✓ A key is stored. It is never shown here." : undefined}
        onChange={(e) => {
          const value = e.target.value;
          setDraft(value);
          const trimmed = value.trim();
          onCommit(validate && validate(trimmed) ? "" : trimmed);
        }} />
      {stored && onRemove && (
        <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" style={{ marginTop: 6 }} disabled={removing} onClick={onRemove}>
          {removing ? "Removing…" : "Remove stored key"}
        </button>
      )}
    </div>
  );
}

