// Setup mode (code plan 18.6): the real admin a press will keep, before its shop exists. The same Riso Press shell and
// menu; Home is the setup guide, and Books (bring a product file over, 18.7), Design, Settings › General, Settings › Plan (with Create my shop, 18.8)
// and Help work. Every other page says
// it comes with the shop. Everything saves to the press's setup record through the platform's door (door.ts); nothing
// here reads or writes a shop database, because there is none until the press opens its shop.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Circle, HelpCircle, Lock, LogOut, Menu, Store, Truck } from "lucide-react";
import {
  AppShell, EmptyState, GhostButton, IconButton, PageHeader, PrimaryButton, SectionCard, SelectField, Sidebar,
  TextField, ToastProvider, Topbar, useRisoToast,
} from "../app/admin/riso/components";
import { ADMIN_LOOKS, applyAdminLook, type AdminLookId } from "../app/admin/riso/adminLook";
import { ChooseLookWelcome } from "../app/admin/overview/ChooseLookWelcome";
import { THEME_LIBRARY } from "../app/admin/studio/themeLibrary";
import { ShopWordsContext, useShopWords } from "../app/admin/shopWords";
import { adminWordsFor } from "../app/admin/sells";
import { ImportPage } from "./ImportPage";
import { WEB_ADDRESS_ANCHOR, WebAddressCard } from "./WebAddress";
import type { PlanList, SetupChange, SetupDoor, SetupPress } from "./door";
import { CreateShopCard, type CreateShop } from "./CreateShop";
import type { CreateNames } from "./launchWords";
import {
  DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, IMPORT_PAGE, PLAN_PAGE, guideProgress, guideSteps, nextGuideStep, pageFromHash, readyToCreate, setupLocked, showMoveIn, setupMenu,
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
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string; termsUrl?: string;
}) {
  return <ToastProvider><SetupAdminInner {...props} /></ToastProvider>;
}

function SetupAdminInner({ press: first, door, lists, email, onSignOut, helpUrl, termsUrl = "/terms/" }: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string; termsUrl?: string;
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

  const open = (next: string, anchor?: string) => {
    setSidebarOpen(false);
    if (location.hash !== `#${next}`) location.hash = next;
    setPage(next);
    document.getElementById("rp-main")?.focus();
    // A guide step that lives part way down its page (Your web address on General) is scrolled to.
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView?.({ block: "start" }));
  };
  // Create my shop (top bar, locked pages, the guide's last step) lands on the review, not the top of Plan.
  const openCreate = () => {
    open(PLAN_PAGE);
    requestAnimationFrame(() => document.getElementById("create-shop")?.scrollIntoView?.({ block: "start" }));
  };
  const save = async (change: SetupChange) => {
    const saved = await door.save(press.pressId, change);
    setPress(saved);
    return saved;
  };

  const pressName = press.pressName || "Your press";
  let content;
  if (setupLocked(page)) content = <OpensWithShop page={setupPageLabel(page, menu)} onOpenShop={openCreate} />;
  else if (page === HOME_PAGE) content = <SetupGuide press={press} onOpen={open} onCreate={openCreate} save={save} />;
  else if (page === GENERAL_PAGE) content = (
    <>
      <PressDetails press={press} lists={lists} save={save} />
      {press.plan !== "stockroom" && <WebAddressCard press={press} door={door} save={save} onSaved={setPress} />}
    </>
  );
  else if (page === IMPORT_PAGE) content = <ImportPage press={press} door={door} onSaved={setPress} />;
  else if (page === DESIGN_PAGE) content = <DesignPage press={press} save={save} />;
  else if (page === PLAN_PAGE) content = (
    <PlanPage press={press} plans={plans} failed={plansFailed} onRetry={loadPlans} save={save} termsUrl={termsUrl}
      names={{ countries: lists.countries, sells: lists.sells, lookName: themeName(press.look) }} email={email}
      createShop={(choice) => door.openShop(press.pressId, choice)} onCreated={setPress} onOpen={open} />
  );
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
              {/* On a phone the button keeps only its icon, as the admin's top-bar buttons do. Once the shop is
                  being made there is nothing left to press. */}
              {press.status === "setup" && (
                <PrimaryButton size="sm" aria-label="Create my shop" icon={<Store size={16} aria-hidden />} onClick={openCreate}>
                  <span className="rp-btn-label">Create my shop</span>
                </PrimaryButton>
              )}
            </div>
          </Topbar>
        }
      >
        {content}
      </AppShell>
    </ShopWordsContext.Provider>
  );
}

/** A page that needs the shop: says so in plain words and points at Create my shop. Writes nothing. */
export function OpensWithShop({ page, onOpenShop }: { page: string; onOpenShop: () => void }) {
  return (
    <>
      <PageHeader title={page} />
      <EmptyState
        icon={<Lock size={28} aria-hidden />}
        title="Comes with your shop"
        description={`${page} starts working as soon as your shop is made. Finish setting up, then create your shop. Nothing is charged before then.`}
        action={<PrimaryButton onClick={onOpenShop}>Create my shop</PrimaryButton>}
      />
    </>
  );
}

/** Why each step matters, shown on the step to do next. Written in book words; the guide shows the shop's own. */
const STEP_WHY: Record<string, string> = {
  plan: "Your website, your stockroom or both. You can change it until your shop is made.",
  details: "Your press's name, what you sell and your country set your shop's words, money and taxes.",
  look: "Every look keeps your words and books, and you can change everything in Design later.",
  books: "Bring your old shop's product file and your books come in as drafts for you to check.",
  domain: "Bring a domain you already have, or buy one. Your shop always has a free address too.",
  open: "Check what goes in, then we make your shop. It starts private, so only you can see it.",
};

function SetupGuide({ press, onOpen, onCreate, save }: { press: SetupPress; onOpen: (page: string, anchor?: string) => void; onCreate: () => void; save: (c: SetupChange) => Promise<SetupPress> }) {
  const w = useShopWords();
  const steps = guideSteps(press);
  const { done, total } = guideProgress(steps);
  const next = nextGuideStep(steps, press);
  const ready = readyToCreate(steps);
  // The last step goes straight to the review on Plan; every other step opens its page.
  const go = (step: { id: string; page: string }) => (step.id === "open" ? onCreate() : onOpen(step.page, step.id === "domain" ? WEB_ADDRESS_ANCHOR : undefined));
  return (
    <>
      <PageHeader title={press.pressName ? `Welcome, ${press.pressName}` : "Welcome"}
        description="Set up your shop here. Nothing is charged, and your free days don't start, until you create it." />
      {showMoveIn(press) && <MoveInCard onBring={() => onOpen(IMPORT_PAGE)} save={save} />}
      <SectionCard title="Setup guide" description={ready ? "All set. Create your shop when you're ready." : `${done} of ${total} done`} collapsible={false}>
        <div role="progressbar" aria-label="Setup guide" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
          style={{ height: 6, background: "var(--rp-divider)", marginBottom: 16 }}>
          <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: "var(--rp-primary)" }} />
        </div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
          {steps.map((step) => {
            // The next step stands out: a tinted row, a line on why it matters and the page's one main button.
            const isNext = step.id === next?.id;
            return (
              <li key={step.id} aria-current={isNext ? "step" : undefined}
                style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: isNext ? "start" : "center", gap: 12, padding: isNext ? "14px 12px" : "12px 0",
                  margin: isNext ? "0 -12px" : 0, borderTop: "1px solid var(--rp-divider)", background: isNext ? "var(--rp-primary-tint)" : undefined }}>
                <span aria-hidden style={{ display: "inline-flex", color: step.done ? "var(--rp-success)" : isNext ? "var(--rp-text)" : "var(--rp-text-subtle)" }}>
                  {step.done ? <Check size={20} /> : step.locked ? <Lock size={18} /> : <Circle size={18} />}
                </span>
                <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                  <span>
                    <strong style={{ color: step.done ? "var(--rp-text-muted)" : undefined }}>{w(step.title)}</strong>
                    {step.optional && !step.done && <span className="rp-hint"> · optional</span>}
                    <span className="rp-sr-only">{step.done ? " (done)" : step.locked ? " (comes with your shop)" : isNext ? " (next)" : ""}</span>
                  </span>
                  {isNext && STEP_WHY[step.id] && <span className="rp-hint">{w(STEP_WHY[step.id])}</span>}
                  {/* Under its reason, so a phone keeps the words full width. */}
                  {isNext && <span style={{ marginTop: 8 }}><PrimaryButton size="sm" onClick={() => go(step)}>{step.action}</PrimaryButton></span>}
                </span>
                {step.locked
                  ? <span className="rp-hint" style={{ textAlign: "right", maxWidth: 120 }}>{step.action}</span>
                  : isNext ? <span />
                    : <GhostButton size="sm" onClick={() => go(step)}>{step.done ? "Change" : step.action}</GhostButton>}
              </li>
            );
          })}
        </ol>
      </SectionCard>
    </>
  );
}

/**
 * The first thing on Home for a press that may already sell somewhere (code plan 23.0): one card above the setup guide,
 * one main button to the Books page, and "I'm starting fresh", which puts the card away for good. The answer is saved
 * on the press's setup record; bringing a shop over still opens even if that save fails.
 */
function MoveInCard({ onBring, save }: { onBring: () => void; save: (c: SetupChange) => Promise<SetupPress> }) {
  const w = useShopWords();
  const toast = useRisoToast();
  const [busy, setBusy] = useState(false);
  const bring = () => { void save({ moving: "yes" }).catch(() => {}); onBring(); };
  const fresh = async () => {
    setBusy(true);
    try {
      await save({ moving: "fresh" });
      toast(w("No problem. You can bring books over any time from Books."), { tone: "ok" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't save. Try again.", { tone: "err" });
      setBusy(false);
    }
  };
  return (
    <section className="rp-card" aria-labelledby="move-in-title" style={{ borderColor: "var(--rp-primary)", borderWidth: 2, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, padding: 20, alignItems: "start" }}>
        <span aria-hidden style={{ display: "inline-flex", color: "var(--rp-primary)", paddingTop: 2 }}><Truck size={28} /></span>
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div>
            <h2 id="move-in-title" style={{ margin: 0, fontSize: 20 }}>Selling somewhere already?</h2>
            <p style={{ margin: "6px 0 0" }}>{w("Bring your shop with you. Your books, prices, photos and stock come across from your old shop's web address or its product file, and links to your old pages keep working. You see everything before anything is kept.")}</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PrimaryButton icon={<ArrowRight size={16} aria-hidden />} onClick={bring}>Bring my shop over</PrimaryButton>
            <GhostButton busy={busy} disabled={busy} onClick={() => void fresh()}>I'm starting fresh</GhostButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function PressDetails({ press, lists, save }: { press: SetupPress; lists: SetupLists; save: (c: SetupChange) => Promise<SetupPress> }) {
  const toast = useRisoToast();
  const [name, setName] = useState(press.pressName);
  const [sells, setSells] = useState(press.sells);
  const [country, setCountry] = useState(press.country);
  const [language, setLanguage] = useState(press.language ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = name.trim() !== press.pressName || sells !== press.sells || country !== press.country || language !== (press.language ?? "");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      // Only what changed, so an answer saved meanwhile in another tab (the front door's Change answers) isn't written over.
      const change: SetupChange = {};
      if (name.trim() !== press.pressName) change.pressName = name.trim();
      if (sells !== press.sells) change.sells = sells;
      if (country !== press.country) change.country = country;
      if (language !== (press.language ?? "")) change.language = language;
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
          <SelectField label="Language of our emails" hint="Automatic writes in French with the English below when your billing address is in Quebec, and in English otherwise. You can change it later in Settings › Plan."
            value={language} onChange={(e) => setLanguage(e.target.value as "" | "fr" | "en")}>
            <option value="">Automatic</option>
            <option value="fr" lang="fr">Français</option>
            <option value="en">English</option>
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

function PlanPage({ press, plans, failed, onRetry, save, termsUrl, names, email, createShop, onCreated, onOpen }: {
  press: SetupPress; plans: PlanList | null; failed: boolean; onRetry: () => void; save: (c: SetupChange) => Promise<SetupPress>;
  termsUrl: string; names: CreateNames; email: string; createShop: CreateShop; onCreated: (press: SetupPress) => void; onOpen: (page: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inSetup = press.status === "setup";
  const byId = Object.fromEntries((plans?.plans ?? []).map((p) => [p.plan, p]));
  const choose = async (plan: SetupPress["plan"]) => {
    if (busy || plan === press.plan) return;
    setBusy(plan); setError("");
    try { await save({ plan }); } catch (err) { setError(err instanceof Error ? err.message : "That didn't save. Try again."); } finally { setBusy(""); }
  };
  // The trial's length comes only from the platform; with none (prices didn't load, or no trial) no days are promised.
  // "Your first shop": billing gives one trial per account, so a second press gets none.
  const trial = plans?.trialDays ?? 0;
  const trialWords = trial > 0 ? `Your first shop is free for ${trial} days once it's made, then monthly` : "Monthly once your shop is made";
  return (
    <>
      <PageHeader title="Plan" description="What you're setting up, and creating your shop." />
      <SectionCard title="Your plan" description={inSetup ? "Change it any time before your shop is made." : "You can change it in Settings › Plan once your shop is ready."} collapsible={false}>
        <div id="plan-choice" role="radiogroup" aria-label="Your plan" style={{ display: "grid", gap: 8 }}>
          {PLAN_ORDER.map((id) => {
            const offer = byId[id];
            const on = press.plan === id;
            return (
              <button key={id} type="button" role="radio" aria-checked={on} disabled={!!busy || !inSetup} onClick={() => void choose(id)}
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
      <CreateShopCard press={press} plans={plans} names={names} email={email} termsUrl={termsUrl} createShop={createShop} onCreated={onCreated} onOpen={onOpen} />
    </>
  );
}

function HelpPage({ helpUrl }: { helpUrl: string }) {
  return (
    <>
      <PageHeader title="Help" description="Answers about setting up and creating your shop." />
      <SectionCard title="Help centre" collapsible={false}>
        <p style={{ marginTop: 0 }}>Plain answers on plans, payments, moving your books in, and your website.</p>
        <a className="rp-btn rp-btn-secondary" href={helpUrl}>Open the help centre</a>
      </SectionCard>
    </>
  );
}
