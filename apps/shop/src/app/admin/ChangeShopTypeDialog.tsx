// Change what kind of shop you are (shop types plan, part 3, 26 November 2026): Settings › General › What you offer ›
// Change. Four short steps: pick the new type (and answer what it needs), see what changes with real counts, choose how
// the website changes, confirm. Nothing is deleted, and Switch back undoes the change for 30 days (shopTypeChange.ts).
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, EyeOff, Plus } from "lucide-react";
import { adminApi } from "./api";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { FormField } from "./riso/FormKit";
import { TYPE_GROUPS, type TypeGroupId } from "../../shared/productTypes";
import { groupsFor, saveProductGroups } from "./productGroups";
import { LEAD_SIDE_CHANGED_EVENT, shopKindOf, type LeadSide } from "./servicesSetup";
import { SELLS_CHANGED_EVENT, SELLS_PRODUCTS_CHANGED_EVENT } from "./shopWords";
import { OTHER_LABEL, OTHER_MAX, OTHER_SERVICE } from "./offerStage";
import { TextField } from "./riso/components";
import { usePlatformPlan } from "./platformPlanApi";
import { shopTypeData } from "./shopTypeApi";
import type { Booking } from "./bookingsApi";
import type { FirstWeekDoc } from "./firstWeek";
import { SERVICE_CHOICES } from "./serviceChoices";
import {
  TYPE_CHOICES, answersProblem, leavesServices, needsBookings, typeChangeWrite, typeName, whatChanges,
  type ShopType, type TypeAnswers, type TypeCounts, type WebsiteChoice,
} from "./shopTypeChange";

type Step = "pick" | "changes" | "website" | "confirm";
const STEPS: Step[] = ["pick", "changes", "website", "confirm"];
const STEP_TITLE: Record<Step, string> = { pick: "Pick your new type", changes: "What changes", website: "Your website", confirm: "Check and change" };

const WEBSITE_CHOICES: { id: WebsiteChoice; label: string; hint: string }[] = [
  { id: "follow", label: "Use your look's matching version (recommended)", hint: "Same look and words, laid out for your new type. Your draft changes; you publish when you're happy." },
  { id: "pick", label: "Pick another website", hint: "We'll open Online store after the change so you can choose." },
  { id: "later", label: "Don't change it yet", hint: "Your website stays as it is until you change it in Online store." },
];

function Choices<T extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: T | null; options: { id: T; label: string; hint?: string; badge?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="rp-sr-only">{label}</legend>
      <div className="rp-choices">
        {options.map((o) => (
          <label key={o.id} className="rp-choice" data-choice={o.id}>
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
            <span style={{ flex: 1 }}>
              <span className="rp-choice-label" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{o.label}{o.badge && <StatusBadge glyph={false}>{o.badge}</StatusBadge>}</span>
              {o.hint && <span className="rp-hint" style={{ display: "block", margin: "2px 0 0" }}>{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const LIST_ICON = { stays: Check, added: Plus, hidden: EyeOff } as const;
function List({ title, lines, tone }: { title: string; lines: string[]; tone: "stays" | "added" | "hidden" }) {
  if (!lines.length) return null;
  const Icon = LIST_ICON[tone];
  return (
    <section data-changes={tone} style={{ display: "grid", gap: 6 }}>
      <h3 className="rp-fk-label" style={{ margin: 0 }}>{title}</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {lines.map((l) => <li key={l} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><Icon size={16} aria-hidden style={{ flex: "none", marginTop: 3, color: "var(--rp-text-muted)" }} />{l}</li>)}
      </ul>
    </section>
  );
}

export function ChangeShopTypeDialog({ doc, onClose, onChanged }: { doc: FirstWeekDoc | null; onClose: () => void; onChanged: (next: FirstWeekDoc) => void }) {
  const from = shopKindOf(doc);
  const { plan } = usePlatformPlan(true);
  const [step, setStep] = useState<Step>("pick");
  const [to, setTo] = useState<ShopType | null>(null);
  const [answers, setAnswers] = useState<TypeAnswers>(() => ({ groups: from === "services" && !Array.isArray(doc?.productGroups) ? [] : groupsFor(doc), lead: from === "products" ? "products" : "services" }));
  const [otherOn, setOtherOn] = useState(false);
  const [website, setWebsite] = useState<WebsiteChoice>("follow");
  const [counts, setCounts] = useState<TypeCounts | null>(null);
  const [upcoming, setUpcoming] = useState<Booking[] | null>(null);
  const [bookingsKeep, setBookingsKeep] = useState<"keep" | "cancel">("keep");
  const [sure, setSure] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    shopTypeData.counts().then((c) => { if (live) setCounts(c); }).catch(() => { if (live) setCounts({ products: null, orders: null, services: null, upcoming: null, clients: null }); });
    if (from !== "products") shopTypeData.upcoming().then((rows) => { if (live) setUpcoming(rows); }).catch(() => { if (live) setUpcoming([]); });
    return () => { live = false; };
  }, []);

  const set = (patch: Partial<TypeAnswers>) => { setProblem(""); setAnswers((a) => ({ ...a, ...patch })); };
  const changes = useMemo(() => (to ? whatChanges(from, to, counts ?? { products: null, orders: null, services: null, upcoming: null, clients: null }) : null), [from, to, counts]);
  const bookingsToAnswer = to && leavesServices(from, to) ? (upcoming?.length ?? 0) : 0;
  const index = STEPS.indexOf(step);

  const next = () => {
    if (step === "pick") {
      const words = to ? answersProblem(from, to, answers) : "Pick a type.";
      if (words) { setProblem(words); return; }
    }
    setProblem("");
    setStep(STEPS[Math.min(index + 1, STEPS.length - 1)]);
  };
  const back = () => { setProblem(""); setStep(STEPS[Math.max(index - 1, 0)]); };

  const change = async () => {
    if (!to) return;
    if (bookingsToAnswer && bookingsKeep === "cancel" && !sure) { setProblem("Tick the box to say yes, cancel them."); return; }
    setBusy(true); setProblem("");
    try {
      if (needsBookings(from, to) && !(await shopTypeData.bookingsOn())) await shopTypeData.openBookings(plan ?? null);
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : "Services couldn't be turned on. Try again in a minute.");
      setBusy(false); return;
    }
    let failed = 0;
    if (bookingsToAnswer && bookingsKeep === "cancel") {
      for (const b of upcoming ?? []) { try { await shopTypeData.cancelOne(b); } catch { failed += 1; } }
    }
    const write = typeChangeWrite(doc, to, answers, website, new Date().toISOString());
    try {
      const { productGroups, ...rest } = write;
      await adminApi.updateFirstWeek(rest);
      if (productGroups) await saveProductGroups(productGroups as TypeGroupId[]);
      const nextDoc = { ...(doc ?? {}), ...write } as FirstWeekDoc;
      if (write.sells) window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: write.sells }));
      window.dispatchEvent(new CustomEvent(SELLS_PRODUCTS_CHANGED_EVENT, { detail: write.sellsProducts }));
      if (write.leadSide) window.dispatchEvent(new CustomEvent(LEAD_SIDE_CHANGED_EVENT, { detail: write.leadSide }));
      onChanged(nextDoc);
      toast.success(failed ? `You're now ${typeName(to).toLowerCase()}. ${failed} booking${failed === 1 ? "" : "s"} couldn't be cancelled: they're still in your calendar.` : `You're now ${to === "products" ? "a product shop" : typeName(to).toLowerCase()}. You can switch back for 30 days.`);
      if (website === "pick") window.location.hash = "design";
      onClose();
    } catch {
      setProblem("Couldn't save the change. Check your connection and try again.");
    } finally { setBusy(false); }
  };

  const groups = answers.groups ?? [];
  const toggleGroup = (id: TypeGroupId) => set({ groups: groups.includes(id) ? groups.filter((g) => g !== id) : [...groups, id] });

  const pickStep = (
    <div style={{ display: "grid", gap: 20 }}>
      <Choices name="shop-type" label="Your new type" value={to} onChange={(v) => { setProblem(""); setTo(v); }}
        options={TYPE_CHOICES.map((c) => ({ id: c.id, label: c.name, hint: c.blurb, badge: c.id === from ? "Now" : undefined }))} />
      {to && to !== "products" && from === "products" && (
        <FormField label="What do people book with you?" hint="Sets the words in your calendar and emails.">
          {(a) => <select {...a} className="rp-select" data-type-service value={answers.service ?? ""} onChange={(e) => set({ service: e.target.value })}>
            <option value="" disabled>Pick one</option>
            {SERVICE_CHOICES.map((c) => <option key={c.id} value={c.id}>{c.id === OTHER_SERVICE ? OTHER_LABEL : c.label}</option>)}
          </select>}
        </FormField>
      )}
      {to && to !== "products" && from === "products" && answers.service === OTHER_SERVICE && (
        <TextField label="What do people book?" placeholder="e.g. Dog grooming" maxLength={OTHER_MAX} value={answers.serviceWords ?? ""} data-type-service-words="" onChange={(e) => set({ serviceWords: e.target.value })} />
      )}
      {to === "products" && from === "services" && (
        <section className="rp-fk-field" aria-labelledby="type-groups-label">
          <h3 id="type-groups-label" className="rp-fk-label" style={{ margin: 0 }}>What do you sell?</h3>
          <div className="rp-group-chips" role="group" aria-labelledby="type-groups-label">
            {TYPE_GROUPS.map((g) => {
              const on = groups.includes(g.id);
              return <button key={g.id} type="button" className="rp-group-chip" aria-pressed={on} onClick={() => toggleGroup(g.id)}>{on && <Check size={14} aria-hidden />}{g.name}</button>;
            })}
            <button type="button" className="rp-group-chip" aria-pressed={otherOn} data-type-group-other onClick={() => { setOtherOn(!otherOn); if (otherOn) set({ otherWords: "" }); }}>{otherOn && <Check size={14} aria-hidden />}{OTHER_LABEL}</button>
          </div>
          {otherOn && <TextField label="What else do you sell?" placeholder="e.g. Surfboards" maxLength={OTHER_MAX} value={answers.otherWords ?? ""} onChange={(e) => set({ otherWords: e.target.value })} />}
        </section>
      )}
      {to === "both" && from !== "both" && (
        <section className="rp-fk-field" aria-labelledby="type-lead-label">
          <h3 id="type-lead-label" className="rp-fk-label" style={{ margin: 0 }}>What do most customers come for?</h3>
          <div className="rp-group-chips" role="radiogroup" aria-labelledby="type-lead-label">
            {([["services", "Booking a time"], ["products", "Buying things"]] as [LeadSide, string][]).map(([id, label]) => (
              <button key={id} type="button" className="rp-group-chip" role="radio" aria-checked={answers.lead === id} data-type-lead={id} onClick={() => set({ lead: id })}>{answers.lead === id && <Check size={14} aria-hidden />}{label}</button>
            ))}
          </div>
          <span className="rp-fk-hint">That side leads your menu. Both stay in.</span>
        </section>
      )}
    </div>
  );

  const changesStep = changes && (
    <div style={{ display: "grid", gap: 20 }} aria-busy={!counts || undefined}>
      <List title="Stays" lines={changes.stays} tone="stays" />
      <List title="Added" lines={changes.added} tone="added" />
      <List title="Hidden, not deleted" lines={changes.hidden} tone="hidden" />
      <p className="rp-hint" style={{ margin: 0 }}>Nothing is deleted. Switching back brings everything back as it was.</p>
    </div>
  );

  const websiteStep = (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="rp-hint" style={{ margin: 0 }}>Your website can follow your new type{to === "services" ? " with a Book a time page" : to === "products" ? " with your products up front" : ""}.</p>
      <Choices name="type-website" label="Your website" value={website} onChange={setWebsite} options={WEBSITE_CHOICES} />
    </div>
  );

  const confirmStep = to && (
    <div style={{ display: "grid", gap: 20 }}>
      <div data-type-summary style={{ display: "grid", gap: 4, padding: "16px 18px", borderRadius: "var(--rp-radius-lg)", background: "var(--rp-primary-tint)" }}>
        <span className="rp-hint" style={{ margin: 0 }}>{typeName(from)} becomes</span>
        <strong style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em" }}>{typeName(to)}</strong>
        <span className="rp-hint" style={{ margin: 0, textTransform: "none" }}>Website: {WEBSITE_CHOICES.find((c) => c.id === website)?.label.replace(" (recommended)", "")}</span>
      </div>
      {bookingsToAnswer > 0 && (
        <section style={{ display: "grid", gap: 10 }} data-type-bookings>
          <h3 className="rp-fk-label" style={{ margin: 0 }}>{bookingsToAnswer} upcoming booking{bookingsToAnswer === 1 ? "" : "s"}</h3>
          <Choices name="type-bookings" label="Upcoming bookings" value={bookingsKeep} onChange={(v) => { setSure(false); setBookingsKeep(v); }} options={[
            { id: "keep", label: "Keep them (recommended)", hint: "They go ahead as booked, with the usual emails. Find them under Ways to sell › Bookings." },
            { id: "cancel", label: "Cancel them and refund everyone", hint: "Each client gets an email and their money back in full." },
          ]} />
          {bookingsKeep === "cancel" && (
            <label className="rp-check" data-type-sure>
              <input type="checkbox" checked={sure} onChange={(e) => { setProblem(""); setSure(e.target.checked); }} />
              Yes, cancel {bookingsToAnswer} booking{bookingsToAnswer === 1 ? "" : "s"} and refund them
            </label>
          )}
        </section>
      )}
      <p className="rp-hint" style={{ margin: 0 }}>You can switch back from Settings for 30 days.</p>
    </div>
  );

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={STEP_TITLE[step]} description={`Step ${index + 1} of ${STEPS.length} · Change your shop's type`} size="lg"
      footer={<>
        {index > 0 ? <SecondaryButton onClick={back} disabled={busy}>Back</SecondaryButton> : <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>}
        {step === "confirm"
          ? <PrimaryButton data-type-change busy={busy} onClick={() => { void change(); }}>{`Change to ${to ? typeName(to).toLowerCase() : ""}`}</PrimaryButton>
          : <PrimaryButton data-type-next onClick={next}>Next</PrimaryButton>}
      </>}>
      <div data-change-type={step}>
        {step === "pick" && pickStep}
        {step === "changes" && changesStep}
        {step === "website" && websiteStep}
        {step === "confirm" && confirmStep}
        {problem && <p role="alert" data-type-problem style={{ margin: "16px 0 0", color: "var(--rp-danger)", fontWeight: 600 }}>{problem}</p>}
      </div>
    </Dialog>
  );
}

