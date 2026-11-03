// Setup mode (code plan 18.6): the real admin a press will keep, before its shop exists. The same Riso Press shell and
// menu; Home is the setup guide, and Design, Settings › General, Settings › Plan and Help work. Every other page says
// it opens with the shop. Everything saves to the press's setup record through the platform's door (door.ts); nothing
// here reads or writes a shop database, because there is none until the press opens its shop.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Circle, HelpCircle, Lock, LogOut, Menu, Store } from "lucide-react";
import {
  AppShell, EmptyState, GhostButton, IconButton, PageHeader, PrimaryButton, SectionCard, SelectField, Sidebar,
  TextField, ToastProvider, Topbar, useRisoToast,
} from "../app/admin/riso/components";
import { ADMIN_LOOKS, applyAdminLook, type AdminLookId } from "../app/admin/riso/adminLook";
import { ChooseLookWelcome } from "../app/admin/overview/ChooseLookWelcome";
import { THEME_LIBRARY } from "../app/admin/studio/themeLibrary";
import { ShopWordsContext } from "../app/admin/shopWords";
import { adminWordsFor } from "../app/admin/sells";
import type { PlanList, SetupChange, SetupDoor, SetupPress } from "./door";
import {
  DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, PLAN_PAGE, guideProgress, guideSteps, pageFromHash, setupLocked, setupMenu,
  setupMenuItemFor, setupPageLabel,
} from "./pages";

/** The platform's own lists (signup/form.js), passed in so the platform keeps one copy of them. */
export interface SetupLists {
  countries: Record<string, { name: string }>;
  sells: Array<{ id: string; label: string }>;
}

const PLAN_LINES: Record<string, string> = {
  both: "Your website and your stock, kept in step",
  shop: "Your website, to sell online",
  stockroom: "Track stock, sales and payouts from fairs and stores",
};
const PLAN_ORDER = ["both", "shop", "stockroom"] as const;
/** The plans' names while the platform's prices load (or if they can't). */
const PLAN_NAMES: Record<string, string> = { both: "Shop and stockroom", shop: "Shop", stockroom: "Stockroom" };

const isAdminLook = (value: string): value is AdminLookId => ADMIN_LOOKS.some((l) => l.id === value);
const themeName = (id: string) => (THEME_LIBRARY as Array<{ id: string; name: string }>).find((t) => t.id === id)?.name ?? "";

function readAppearance(): "light" | "dark" {
  try { return localStorage.getItem("adminThemeReso") === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function SetupAdmin(props: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string;
}) {
  return <ToastProvider><SetupAdminInner {...props} /></ToastProvider>;
}

function SetupAdminInner({ press: first, door, lists, email, onSignOut, helpUrl }: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string;
}) {
  const [press, setPress] = useState(first);
  const [plans, setPlans] = useState<PlanList | null>(null);
  const menu = useMemo(() => setupMenu(), []);
  const [page, setPage] = useState(() => pageFromHash(typeof location === "undefined" ? "" : location.hash, menu) ?? HOME_PAGE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const appearance = useMemo(readAppearance, []);
  const w = useMemo(() => adminWordsFor(press.sells || null), [press.sells]);

  const [plansFailed, setPlansFailed] = useState(false);
  const loadPlans = () => { setPlansFailed(false); door.plans().then(setPlans, () => setPlansFailed(true)); };
  useEffect(loadPlans, [door]);
  // The admin look chosen in the welcome applies here at once, as it will in the shop's own admin.
  useEffect(() => { if (isAdminLook(press.adminLook)) applyAdminLook(press.adminLook); }, [press.adminLook]);
  useEffect(() => {
    // An address that names no page (the skip link's #rp-main) leaves the page as it is, so nothing typed is lost.
    const onHash = () => { const next = pageFromHash(location.hash, menu); if (next) setPage(next); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [menu]);

  const open = (next: string) => {
    setSidebarOpen(false);
    if (location.hash !== `#${next}`) location.hash = next;
    setPage(next);
    document.getElementById("rp-main")?.focus();
  };
  const save = async (change: SetupChange) => {
    const saved = await door.save(press.pressId, change);
    setPress(saved);
    return saved;
  };

  const pressName = press.pressName || "Your press";
  let content;
  if (setupLocked(page)) content = <OpensWithShop page={setupPageLabel(page, menu)} onOpenShop={() => open(PLAN_PAGE)} />;
  else if (page === HOME_PAGE) content = <SetupGuide press={press} onOpen={open} />;
  else if (page === GENERAL_PAGE) content = <PressDetails press={press} lists={lists} save={save} />;
  else if (page === DESIGN_PAGE) content = <DesignPage press={press} save={save} />;
  else if (page === PLAN_PAGE) content = <PlanPage press={press} plans={plans} failed={plansFailed} onRetry={loadPlans} save={save} />;
  else content = <HelpPage helpUrl={helpUrl} />;

  return (
    <ShopWordsContext.Provider value={w}>
      <AppShell
        appearance={appearance}
        sidebar={
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            items={menu.map((item) => ({ ...item, label: w(item.label), ...(item.children ? { children: item.children.map((c) => ({ ...c, label: w(c.label) })) } : {}) }))}
            activeId={setupMenuItemFor(page, menu)}
            activeChildId={page}
            onSelect={open}
            onSelectChild={(_item, child) => open(child)}
            brand={
              <a className="rp-brand-link" href={`#${HOME_PAGE}`} aria-label="Setup guide" onClick={(e) => { e.preventDefault(); open(HOME_PAGE); }}>
                <span className="rp-brand-text">
                  <span className="rp-wordmark">{pressName}</span>
                  <span className="rp-wordmark-sub">Setting up</span>
                </span>
              </a>
            }
            footer={
              <>
                <p style={{ margin: "0 12px 4px", fontSize: 12, opacity: 0.75, overflowWrap: "anywhere" }}>{email}</p>
                <button type="button" className="rp-nav-item" aria-current={page === HELP_PAGE ? "page" : undefined} onClick={() => open(HELP_PAGE)}><HelpCircle size={18} aria-hidden />Help</button>
                <button type="button" className="rp-nav-item" onClick={onSignOut}><LogOut size={18} aria-hidden />Sign out</button>
              </>
            }
          />
        }
        topbar={
          <Topbar>
            <IconButton label="Open navigation" className="rp-menu-only" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
              <Menu size={20} aria-hidden />
            </IconButton>
            <a className="rp-topbar-wordmark" href={`#${HOME_PAGE}`} onClick={(e) => { e.preventDefault(); open(HOME_PAGE); }}>{pressName}</a>
            <div className="rp-topbar-actions">
              {/* On a phone the button keeps only its icon, as the admin's top-bar buttons do. */}
              <PrimaryButton size="sm" aria-label="Open my shop" icon={<Store size={16} aria-hidden />} onClick={() => open(PLAN_PAGE)}>
                <span className="rp-btn-label">Open my shop</span>
              </PrimaryButton>
            </div>
          </Topbar>
        }
      >
        {content}
      </AppShell>
    </ShopWordsContext.Provider>
  );
}

/** A page that needs the shop: says so in plain words and points at Open my shop. Writes nothing. */
export function OpensWithShop({ page, onOpenShop }: { page: string; onOpenShop: () => void }) {
  return (
    <>
      <PageHeader title={page} />
      <EmptyState
        icon={<Lock size={28} aria-hidden />}
        title="Opens with your shop"
        description={`${page} starts working the moment your shop opens. Finish setting up, then open your shop. Nothing is charged before then.`}
        action={<PrimaryButton onClick={onOpenShop}>Open my shop</PrimaryButton>}
      />
    </>
  );
}

function SetupGuide({ press, onOpen }: { press: SetupPress; onOpen: (page: string) => void }) {
  const steps = guideSteps(press);
  const { done, total } = guideProgress(steps);
  return (
    <>
      <PageHeader title={press.pressName ? `Welcome, ${press.pressName}` : "Welcome"}
        description="Set up your shop here. Nothing is charged, and your free days don't start, until you open it." />
      <SectionCard title="Setup guide" description={`${done} of ${total} done`} collapsible={false}>
        <div role="progressbar" aria-label="Setup guide" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
          style={{ height: 6, background: "var(--rp-divider)", marginBottom: 16 }}>
          <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: "var(--rp-primary)" }} />
        </div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
          {steps.map((step) => (
            <li key={step.id} style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid var(--rp-divider)" }}>
              <span aria-hidden style={{ display: "inline-flex", color: step.done ? "var(--rp-success)" : "var(--rp-text-subtle)" }}>
                {step.done ? <Check size={20} /> : step.locked ? <Lock size={18} /> : <Circle size={18} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ color: step.done ? "var(--rp-text-muted)" : undefined }}>{step.title}</strong>
                <span className="rp-sr-only">{step.done ? " (done)" : step.locked ? " (opens with your shop)" : ""}</span>
              </span>
              {step.locked
                ? <span className="rp-hint" style={{ textAlign: "right", maxWidth: 120 }}>{step.action}</span>
                : <GhostButton size="sm" onClick={() => onOpen(step.page)}>{step.done ? "Change" : step.action}</GhostButton>}
            </li>
          ))}
        </ol>
      </SectionCard>
    </>
  );
}

function PressDetails({ press, lists, save }: { press: SetupPress; lists: SetupLists; save: (c: SetupChange) => Promise<SetupPress> }) {
  const toast = useRisoToast();
  const [name, setName] = useState(press.pressName);
  const [sells, setSells] = useState(press.sells);
  const [country, setCountry] = useState(press.country);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = name.trim() !== press.pressName || sells !== press.sells || country !== press.country;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      // Only what changed, so an answer saved meanwhile in another tab (the front door's Change answers) isn't written over.
      const change: SetupChange = {};
      if (name.trim() !== press.pressName) change.pressName = name.trim();
      if (sells !== press.sells) change.sells = sells;
      if (country !== press.country) change.country = country;
      await save(change);
      toast("Saved", { tone: "ok" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="General" description="Your press's details. They go into your shop when it opens, and you can change them any time." />
      <SectionCard title="Your press" collapsible={false}>
        <form onSubmit={submit} style={{ display: "grid", gap: 16, maxWidth: 520 }}>
          <TextField label="Press name" value={name} maxLength={120} autoComplete="organization" onChange={(e) => setName(e.target.value)} />
          <SelectField label="What you sell" hint="It sets your shop's words and the looks we suggest." value={sells} onChange={(e) => setSells(e.target.value)}>
            <option value="">Not said yet</option>
            {lists.sells.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </SelectField>
          <SelectField label="Country" hint="It sets your shop's money and taxes." value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Choose your country</option>
            {Object.entries(lists.countries).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}
          </SelectField>
          {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
          <div><PrimaryButton type="submit" busy={busy} disabled={!dirty}>Save</PrimaryButton></div>
        </form>
      </SectionCard>
    </>
  );
}

function DesignPage({ press, save }: { press: SetupPress; save: (c: SetupChange) => Promise<SetupPress> }) {
  const [choosing, setChoosing] = useState(!press.look);
  if (press.plan === "stockroom") {
    return (
      <>
        <PageHeader title="Design" />
        <EmptyState title="No website on your plan" description="You picked the stockroom on its own, so there's no website to design. Add the shop in Settings › Plan any time." />
      </>
    );
  }
  if (!choosing) {
    return (
      <>
        <PageHeader title="Design" description="Your website's look. It's put in place when your shop opens, and you can change everything in Design after that." />
        <SectionCard title={themeName(press.look) || "Your look"} description="Chosen" collapsible={false}
          actions={<GhostButton size="sm" onClick={() => setChoosing(true)}>Choose another look</GhostButton>}>
          <p className="rp-hint" style={{ margin: 0 }}>Every look keeps your words, products and pages.</p>
        </SectionCard>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Design" />
      <ChooseLookWelcome
        publishes={press.sells || null}
        settings={{ info: { name: press.pressName } }}
        apply={async () => {}}
        intro="Pick a look for your website. It's kept with your setup and put in place when your shop opens."
        keep={press.look ? { label: `Keep ${themeName(press.look) || "my look"}`, onKeep: () => setChoosing(false) } : undefined}
        onDone={async (welcome) => {
          await save({ look: welcome.theme, ...(welcome.adminLook ? { adminLook: welcome.adminLook } : {}) });
          setChoosing(false);
        }}
      />
    </>
  );
}

function PlanPage({ press, plans, failed, onRetry, save }: {
  press: SetupPress; plans: PlanList | null; failed: boolean; onRetry: () => void; save: (c: SetupChange) => Promise<SetupPress>;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const byId = Object.fromEntries((plans?.plans ?? []).map((p) => [p.plan, p]));
  const choose = async (plan: SetupPress["plan"]) => {
    if (busy || plan === press.plan) return;
    setBusy(plan); setError("");
    try { await save({ plan }); } catch (err) { setError(err instanceof Error ? err.message : "That didn't save. Try again."); } finally { setBusy(""); }
  };
  // The trial's length comes only from the platform; with none (prices didn't load, or no trial) no days are promised.
  // "Your first shop": billing gives one trial per account, so a second press gets none.
  const trial = plans?.trialDays ?? 0;
  const trialWords = trial > 0 ? `Your first shop is free for ${trial} days once it opens, then monthly` : "Monthly once your shop opens";
  return (
    <>
      <PageHeader title="Plan" description="What you're setting up, and opening your shop." />
      <SectionCard title="Your plan" description="Change it any time before your shop opens." collapsible={false}>
        <div role="radiogroup" aria-label="Your plan" style={{ display: "grid", gap: 8 }}>
          {PLAN_ORDER.map((id) => {
            const offer = byId[id];
            const on = press.plan === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} disabled={!!busy} onClick={() => void choose(id)}
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", alignItems: "center", textAlign: "left", minHeight: 56, padding: 14,
                  background: on ? "var(--rp-primary-tint)" : "var(--rp-surface)", color: "var(--rp-text)", cursor: "pointer",
                  border: on ? "2px solid var(--rp-text)" : "1px solid var(--rp-border)" }}>
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{offer?.name ?? PLAN_NAMES[id]}</strong>
                  <span className="rp-hint">{PLAN_LINES[id]}</span>
                </span>
                {offer && (
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {offer.foundingPriceText && <s className="rp-hint" style={{ display: "block" }}>{offer.priceText}</s>}
                    <strong>{offer.foundingPriceText ?? offer.priceText}</strong>
                    <span className="rp-hint" style={{ display: "block" }}>a month</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)" }}>{error}</p>}
        {failed ? (
          <p role="alert" className="rp-hint" style={{ marginBottom: 0 }}>
            Prices couldn't load. <button type="button" className="rp-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline", color: "inherit", font: "inherit" }} onClick={onRetry}>Try again</button>
          </p>
        ) : plans && (
          <p className="rp-hint" style={{ marginBottom: 0 }}>
            {`${trialWords}${plans.plusTax ? ", plus tax" : ""}.`}
            {plans.foundingOffer ? ` The first ${plans.foundingOffer.presses} presses to pay keep ${plans.foundingOffer.percentOff}% off for as long as they stay.` : ""}
          </p>
        )}
      </SectionCard>
      <SectionCard title="Open my shop" collapsible={false}
        description="Opening makes your website and stockroom, with everything you set up here.">
        <p style={{ marginTop: 0 }}>Opening your shop is the next step we're adding. Everything you set up here is kept{trial > 0 ? ", and your free days start only when your shop opens" : ""}.</p>
        <PrimaryButton disabled aria-describedby="open-soon">Open my shop</PrimaryButton>
        <p id="open-soon" className="rp-hint" style={{ marginBottom: 0 }}>Coming soon.</p>
      </SectionCard>
    </>
  );
}

function HelpPage({ helpUrl }: { helpUrl: string }) {
  return (
    <>
      <PageHeader title="Help" description="Answers about setting up and opening your shop." />
      <SectionCard title="Help centre" collapsible={false}>
        <p style={{ marginTop: 0 }}>Plain answers on plans, payments, moving your books in, and your website.</p>
        <a className="rp-btn rp-btn-secondary" href={helpUrl}>Open the help centre</a>
      </SectionCard>
    </>
  );
}
