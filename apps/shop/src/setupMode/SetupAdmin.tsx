// Setup mode (code plan 18.6): the real admin a press will keep, before its shop exists. The same Riso Press shell and
// menu; Home is the setup guide, and Books (bring a product file over, 18.7), Design, Settings › General, Settings › Plan (with Create my shop, 18.8)
// and Help work. Every other page says
// it comes with the shop. Everything saves to the press's setup record through the platform's door (door.ts); nothing
// here reads or writes a shop database, because there is none until the press opens its shop.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, Circle, ExternalLink, HelpCircle, Lock, LogOut, Menu, MessageCircle, Store, Truck } from "lucide-react";
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
import type { PlanList, SetupChange, SetupDoor, SetupPress } from "./door";
import { CreateShopCard, type CreateShop } from "./CreateShop";
import type { CreateNames } from "./launchWords";
import {
  DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, IMPORT_PAGE, PLAN_PAGE, SETUP_QUESTIONS, STEP_HELP, guideProgress, guideSteps, lockedPageLine, nextGuideStep,
  pageFromHash, readyToCreate, setupLocked, showMoveIn, setupMenu, setupMenuItemFor, setupPageLabel,
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
  /** Where a press asks a person for help (the platform's account page). */
  accountUrl?: string;
}) {
  return <ToastProvider><SetupAdminInner {...props} /></ToastProvider>;
}

function SetupAdminInner({ press: first, door, lists, email, onSignOut, helpUrl, termsUrl = "/terms/", accountUrl = "/account/" }: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string; termsUrl?: string; accountUrl?: string;
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
  if (setupLocked(page)) content = <OpensWithShop page={setupPageLabel(page, menu)} line={w(lockedPageLine(page))} onOpenShop={openCreate} onBack={() => open(HOME_PAGE)} />;
  else if (page === HOME_PAGE) content = <SetupGuide press={press} plans={plans} helpUrl={helpUrl} accountUrl={accountUrl} onOpen={open} onCreate={openCreate} save={save} />;
  else if (page === GENERAL_PAGE) content = <PressDetails press={press} lists={lists} save={save} />;
  else if (page === IMPORT_PAGE) content = <ImportPage press={press} door={door} onSaved={setPress} />;
  else if (page === DESIGN_PAGE) content = <DesignPage press={press} save={save} />;
  else if (page === PLAN_PAGE) content = (
    <PlanPage press={press} plans={plans} failed={plansFailed} onRetry={loadPlans} save={save} termsUrl={termsUrl}
      names={{ countries: lists.countries, sells: lists.sells, lookName: themeName(press.look) }} email={email}
      createShop={(choice) => door.openShop(press.pressId, choice)} onCreated={setPress} onOpen={open} />
  );
  else content = <HelpPage helpUrl={helpUrl} accountUrl={accountUrl} />;

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

/**
 * A page that needs the shop: says what it will do and that it comes with the shop, sends the press back to the setup
 * guide, and offers Create my shop. Writes nothing.
 */
export function OpensWithShop({ page, line = "", onOpenShop, onBack }: { page: string; line?: string; onOpenShop: () => void; onBack?: () => void }) {
  return (
    <>
      <PageHeader title={page} />
      <EmptyState
        icon={<Lock size={28} aria-hidden />}
        title="Comes with your shop"
        description={`${line ? `${line} ` : ""}${page} starts working as soon as your shop is made. Nothing is charged before then.`}
        action={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {onBack && <PrimaryButton icon={<ArrowRight size={16} aria-hidden />} onClick={onBack}>Back to the setup guide</PrimaryButton>}
            <GhostButton onClick={onOpenShop}>Create my shop</GhostButton>
          </div>
        }
      />
    </>
  );
}

/** Why each step matters, shown when its row is open. Written in book words; the guide shows the shop's own. */
const STEP_WHY: Record<string, string> = {
  plan: "Your website, your stockroom or both. You can change it until your shop is made.",
  details: "Your press's name, what you sell and your country set your shop's words, money and taxes.",
  look: "Every look keeps your words and books, and you can change everything in Design later.",
  books: "Bring your old shop's product file and your books come in as drafts for you to check.",
  open: "Check what goes in, then we make your shop. It starts private, so only you can see it.",
};

const helpLink = (helpUrl: string, id: string) => `${helpUrl}#${id}`;

/**
 * Home in setup mode: the setup guide (one row per step, Shopify-style: the next step opens with why it matters and its
 * button, and any other step opens on a click), then what happens once the shop is made and where to get help.
 */
function SetupGuide({ press, plans, helpUrl, accountUrl, onOpen, onCreate, save }: {
  press: SetupPress; plans: PlanList | null; helpUrl: string; accountUrl: string; onOpen: (page: string) => void; onCreate: () => void; save: (c: SetupChange) => Promise<SetupPress>;
}) {
  const w = useShopWords();
  const steps = guideSteps(press);
  const { done, total } = guideProgress(steps);
  const next = nextGuideStep(steps, press);
  const ready = readyToCreate(steps);
  // The open row follows the next step as steps get done, until the press opens another one itself. That choice is
  // remembered for this visit, so going to a step's page and back keeps the same row open.
  const pickKey = `setupGuideStep:${press.pressId}`;
  const [picked, setPickedState] = useState<string | null>(() => { try { return sessionStorage.getItem(pickKey); } catch { return null; } });
  const setPicked = (id: string) => { setPickedState(id); try { sessionStorage.setItem(pickKey, id); } catch { /* private window */ } };
  // A remembered step that is now done gives way to the next one, so finishing a step moves the guide on.
  const pickedStep = steps.find((st) => st.id === picked);
  const shown = picked === "" ? "" : pickedStep && !pickedStep.done && !pickedStep.locked ? pickedStep.id : next?.id ?? null;
  // The last step goes straight to the review on Plan; every other step opens its page.
  const go = (step: { id: string; page: string }) => (step.id === "open" ? onCreate() : onOpen(step.page));
  const left = total - done;
  return (
    <div className="rp-setup-home">
      <PageHeader title={press.pressName ? `Welcome, ${press.pressName}` : "Welcome"}
        description="Set up your shop here. Nothing is charged, and your free days don't start, until you create it." />
      {ready && <ReadyCard onCreate={onCreate} />}
      {showMoveIn(press) && <MoveInCard onBring={() => onOpen(IMPORT_PAGE)} save={save} />}
      <SectionCard title="Setup guide" collapsible={false}
        description={ready ? "All set. Create your shop when you're ready." : `${done} of ${total} done · ${left === 1 ? "one step" : `${left} steps`} to go`}>
        <div role="progressbar" aria-label="Setup guide" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
          style={{ height: 6, background: "var(--rp-divider)", marginBottom: 8 }}>
          <div style={{ width: `${(done / total) * 100}%`, height: "100%", background: "var(--rp-primary)" }} />
        </div>
        <ol aria-label="Setup steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
          {steps.map((step) => {
            const isNext = step.id === next?.id;
            const isOpen = step.id === shown && !step.locked;
            const help = STEP_HELP[step.id];
            const panel = `guide-step-${step.id}`;
            return (
              <li key={step.id} aria-current={isNext ? "step" : undefined}
                style={{ borderTop: "1px solid var(--rp-divider)", margin: "0 -12px", padding: "0 12px", background: isOpen ? "var(--rp-primary-tint)" : undefined }}>
                <button type="button" aria-expanded={isOpen} aria-controls={panel} disabled={step.locked}
                  onClick={() => setPicked(isOpen ? "" : step.id)}
                  style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr) auto", alignItems: "center", gap: 12, width: "100%", minHeight: 48,
                    padding: "12px 0", background: "none", border: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: step.locked ? "default" : "pointer" }}>
                  <span aria-hidden style={{ display: "inline-flex", color: step.done ? "var(--rp-success)" : isNext ? "var(--rp-text)" : "var(--rp-text-subtle)" }}>
                    {step.done ? <Check size={20} /> : step.locked ? <Lock size={18} /> : <Circle size={18} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ color: step.done ? "var(--rp-text-muted)" : undefined }}>{w(step.title)}</strong>
                    {step.optional && !step.done && <span className="rp-hint"> · optional</span>}
                    <span className="rp-sr-only">{step.done ? " (done)" : step.locked ? " (comes with your shop)" : isNext ? " (next)" : ""}</span>
                  </span>
                  {step.locked
                    ? <span className="rp-hint" style={{ textAlign: "right", maxWidth: 120 }}>{step.action}</span>
                    : <ChevronDown size={18} aria-hidden style={{ transform: isOpen ? "rotate(180deg)" : undefined, color: "var(--rp-text-subtle)" }} />}
                </button>
                {isOpen && (
                  <div id={panel} style={{ display: "grid", gap: 10, padding: "0 0 16px 32px" }}>
                    {STEP_WHY[step.id] && <p className="rp-hint" style={{ margin: 0 }}>{w(STEP_WHY[step.id])}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                      {step.done
                        ? <GhostButton size="sm" onClick={() => go(step)}>Change</GhostButton>
                        : <PrimaryButton size="sm" onClick={() => go(step)}>{step.action}</PrimaryButton>}
                      {help && (
                        <a className="rp-hint" href={helpLink(helpUrl, help)} target="_blank" rel="noopener"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--rp-text)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                          How this works<ExternalLink size={12} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </SectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, marginTop: 16 }}>
        <AfterCreating plan={press.plan} plans={plans} />
        <HelpCard helpUrl={helpUrl} accountUrl={accountUrl} />
      </div>
    </div>
  );
}

/** Everything the shop needs is in: one clear card at the top of Home, so the last step can't be missed. */
function ReadyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rp-card" aria-labelledby="ready-title" style={{ borderColor: "var(--rp-success)", borderWidth: 2, marginBottom: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 16, padding: 20, alignItems: "start" }}>
        <span aria-hidden style={{ display: "inline-flex", color: "var(--rp-success)", paddingTop: 2 }}><Check size={28} /></span>
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <div>
            <h2 id="ready-title" style={{ margin: 0, fontSize: 20 }}>You're ready to create your shop</h2>
            <p style={{ margin: "6px 0 0" }}>Everything your shop needs is in. Check it over once more, then create it. It starts private, so only you can see it.</p>
          </div>
          <div><PrimaryButton icon={<Store size={16} aria-hidden />} onClick={onCreate}>Create my shop</PrimaryButton></div>
        </div>
      </div>
    </section>
  );
}

/**
 * What happens once the shop is made, so creating it isn't a leap in the dark. The free days are promised only when the
 * platform's plans say there is a trial (and as "your first shop": billing gives one trial per account).
 */
function AfterCreating({ plan, plans }: { plan: SetupPress["plan"]; plans: PlanList | null }) {
  const trial = plans?.trialDays ?? 0;
  const website = plan !== "stockroom";
  const lines = [
    website ? "We make your shop privately. Only you can see your website until you open it." : "We make your stockroom. Only you and the people you invite can see it.",
    trial > 0 ? `Your first shop is free for ${trial} days from then. Add a card any time before they end to carry on.` : "Your plan starts then, and you can change it in Settings › Plan.",
    website ? "Add how you get paid and what shipping costs, try a test order, then open to shoppers when you're ready." : "Add your stock, then ring up sales at fairs and in stores.",
  ];
  return (
    <SectionCard title="Once your shop is made" collapsible={false}>
      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, listStyle: "decimal" }}>
        {lines.map((line) => <li key={line}>{line}</li>)}
      </ol>
    </SectionCard>
  );
}

/** Where to get help: the answers asked about most, and a person who answers in writing. */
function HelpCard({ helpUrl, accountUrl }: { helpUrl: string; accountUrl: string }) {
  return (
    <SectionCard title="Need a hand?" collapsible={false}>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
        {SETUP_QUESTIONS.slice(0, 3).map((q) => (
          <li key={q.id}><a href={helpLink(helpUrl, q.id)} target="_blank" rel="noopener" style={{ color: "var(--rp-text)", textDecoration: "underline", textUnderlineOffset: 3 }}>{q.question}<span className="rp-sr-only"> (opens in a new tab)</span></a></li>
        ))}
      </ul>
      <p className="rp-hint" style={{ margin: "12px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
        <MessageCircle size={14} aria-hidden />
        <span>Stuck? <a href={accountUrl} style={{ color: "var(--rp-text)", textDecoration: "underline" }}>Ask us from your account page</a> and a person answers in writing.</span>
      </p>
    </SectionCard>
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

/** Help in setup: the answers asked about most while setting up, the help centre, and a person to ask. */
function HelpPage({ helpUrl, accountUrl }: { helpUrl: string; accountUrl: string }) {
  return (
    <>
      <PageHeader title="Help" description="Answers about setting up and creating your shop." />
      <SectionCard title="While you set up" collapsible={false}>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid" }}>
          {SETUP_QUESTIONS.map((q) => (
            <li key={q.id} style={{ borderTop: "1px solid var(--rp-divider)" }}>
              <a href={`${helpUrl}#${q.id}`} target="_blank" rel="noopener"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 48, padding: "8px 0", color: "var(--rp-text)" }}>
                <span>{q.question}</span><ExternalLink size={14} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </SectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, marginTop: 16 }}>
        <SectionCard title="Help centre" collapsible={false}>
          <p style={{ marginTop: 0 }}>Plain answers on plans, payments, moving your books in, and your website.</p>
          <a className="rp-btn rp-btn-secondary" href={helpUrl}>Open the help centre</a>
        </SectionCard>
        <SectionCard title="Ask a person" collapsible={false}>
          <p style={{ marginTop: 0 }}>Ask from your account page and a person answers in writing.</p>
          <a className="rp-btn rp-btn-secondary" href={accountUrl}>Go to my account</a>
        </SectionCard>
      </div>
    </>
  );
}
