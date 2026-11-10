// Setup mode (code plan 18.6): the real admin a press will keep, before its shop exists. The same Riso Press shell and
// menu; Home is the setup guide, and Books (bring a product file over, 18.7), Design, Settings › General, Settings › Plan (with Create my shop, 18.8)
// and Help work. Every other page says
// it comes with the shop. Everything saves to the press's setup record through the platform's door (door.ts); nothing
// here reads or writes a shop database, because there is none until the press opens its shop.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, ChevronDown, ExternalLink, HelpCircle, Lock, LogOut, Menu, Store } from "lucide-react";
import {
  AppShell, EmptyState, GhostButton, IconButton, PageHeader, PrimaryButton, SectionCard, SelectField, Sidebar,
  TextField, ToastProvider, Topbar, useRisoToast,
} from "../app/admin/riso/components";
import { ChooseLookWelcome } from "../app/admin/overview/ChooseLookWelcome";
import { THEME_LIBRARY } from "../app/admin/studio/themeLibrary";
import { ShopWordsContext, useShopWords } from "../app/admin/shopWords";
import { adminWordsFor } from "../app/admin/sells";
import { ImportPage } from "./ImportPage";
import { CARD_CHOICE_NOTE, CARD_PROVIDER_CHOICES, chosenCardProvider, squareAvailable, type CardProviderId } from "./cardChoice";
import { WEB_ADDRESS_ANCHOR, WebAddressCard } from "./WebAddress";
import { BrandLogo } from "../app/components/brand/BrandLogo";
import { AskForm, HelpAnswer, HelpQuestions, type HelpAnswers } from "./SetupHelp";
import type { PlanList, SetupChange, SetupDoor, SetupPress } from "./door";
import { CreateShopCard, type CreateShop } from "./CreateShop";
import type { CreateNames } from "./launchWords";
import { ProgressTile } from "../app/admin/overview/ProgressTile";
import "../app/admin/overview/setupBoard.css";
import {
  DESIGN_PAGE, GENERAL_PAGE, HELP_PAGE, HOME_PAGE, IMPORT_PAGE, PAYMENTS_PAGE, PLAN_PAGE, SETUP_QUESTIONS, STEP_HELP, guideProgress, guideSteps, setupGroups, helpFor, lockedPageLine, nextGuideStep,
  pageFromHash, readyToCreate, setupLocked, setupMenu, setupMenuItemFor, setupPageLabel,
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

const NO_ANSWERS: HelpAnswers = new Map();

const themeName = (id: string) => (THEME_LIBRARY as Array<{ id: string; name: string }>).find((t) => t.id === id)?.name ?? "";

function readAppearance(): "light" | "dark" {
  try { return localStorage.getItem("adminThemeReso") === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function SetupAdmin(props: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string; termsUrl?: string;
  /** Where a press sees its earlier help requests (the platform's account page). */
  accountUrl?: string;
  /**
   * The platform's help answers by id, shown in place; empty (links into the help centre) when they didn't load. Given
   * as what the shop sells → answers, they follow a change in Settings › General at once (code plan 12.18).
   */
  answers?: HelpAnswers | ((sells: string | null) => HelpAnswers);
}) {
  return <ToastProvider><SetupAdminInner {...props} /></ToastProvider>;
}

function SetupAdminInner({ press: first, door, lists, email, onSignOut, helpUrl, termsUrl = "/terms/", accountUrl = "/account/", answers: given = NO_ANSWERS }: {
  press: SetupPress; door: SetupDoor; lists: SetupLists; email: string; onSignOut: () => void; helpUrl: string; termsUrl?: string; accountUrl?: string; answers?: HelpAnswers | ((sells: string | null) => HelpAnswers);
}) {
  const [press, setPress] = useState(first);
  const [plans, setPlans] = useState<PlanList | null>(null);
  const menu = useMemo(() => setupMenu(), []);
  const [page, setPage] = useState(() => pageFromHash(typeof location === "undefined" ? "" : location.hash, menu) ?? HOME_PAGE);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const appearance = useMemo(readAppearance, []);
  const w = useMemo(() => adminWordsFor(press.sells || null), [press.sells]);
  const answers = useMemo(() => (typeof given === "function" ? given(press.sells || null) : given), [given, press.sells]);

  const [plansFailed, setPlansFailed] = useState(false);
  const loadPlans = () => { setPlansFailed(false); door.plans().then(setPlans, () => setPlansFailed(true)); };
  useEffect(loadPlans, [door]);
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
  const planPage = () => (
    <PlanPage press={press} plans={plans} failed={plansFailed} onRetry={loadPlans} save={save} termsUrl={termsUrl}
      names={{ countries: lists.countries, sells: lists.sells, lookName: themeName(press.look) }} email={email}
      createShop={(choice) => door.openShop(press.pressId, choice)} onCreated={setPress} onOpen={open}
      follow={async () => (await door.presses()).find((p) => p.pressId === press.pressId) ?? null} retry={door.retryShop} />
  );
  let content;
  // Once Create my shop has run, setup can't change: every page but Help shows the shop being made.
  const made = press.status !== "setup";
  if (made && page !== HELP_PAGE) content = planPage();
  else if (setupLocked(page)) content = <OpensWithShop page={setupPageLabel(page, menu)} line={w(lockedPageLine(page))} onOpenShop={openCreate} onBack={() => open(HOME_PAGE)} />;
  else if (page === HOME_PAGE) content = <SetupGuide press={press} helpUrl={helpFor(helpUrl, press.sells)} answers={answers} onOpen={open} onCreate={openCreate} />;
  else if (page === GENERAL_PAGE) content = (
    <>
      <PressDetails press={press} lists={lists} save={save} />
      {press.plan !== "stockroom" && <WebAddressCard press={press} door={door} save={save} onSaved={setPress} />}
    </>
  );
  else if (page === IMPORT_PAGE) content = <ImportPage press={press} door={door} onSaved={setPress} />;
  else if (page === DESIGN_PAGE) content = <DesignPage press={press} save={save} />;
  else if (page === PAYMENTS_PAGE) content = <CardPaymentsPage press={press} save={save} />;
  else if (page === PLAN_PAGE) content = planPage();
  else content = <HelpPage helpUrl={helpFor(helpUrl, press.sells)} accountUrl={accountUrl} answers={answers} ask={door.askForHelp} pressName={press.pressName} />;

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
              {/* The one action setup is for, so it keeps a word on a phone ("Create"; setup.css) where the admin's
                  other top-bar buttons keep only their icon. Once the shop is being made there is nothing left to press. */}
              {press.status === "setup" && (
                <span className="rp-setup-create">
                  <PrimaryButton size="sm" icon={<Store size={16} aria-hidden />} onClick={openCreate}>
                    <span className="rp-setup-create-long">Create my shop</span><span className="rp-setup-create-short" aria-hidden>Create</span>
                    <span className="rp-sr-only rp-setup-create-sr">Create my shop</span>
                  </PrimaryButton>
                </span>
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
        description={`${line ? `${line} ` : ""}Ready once your shop is made.`}
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
  look: "Your words and books stay the same in every look. Change any part later in Design.",
  books: "Your old shop's product file brings your books in as drafts to check.",
  domain: "Use a domain you have, or buy one.",
  open: "Check what goes in, then we make your shop. It starts private, so only you can see it.",
};

const helpLink = (helpUrl: string, id: string) => `${helpUrl}#${id}`;

/**
 * Home in setup mode: the setup guide (one row per step, Shopify-style: the next step opens with why it matters and its
 * button, and any other step opens on a click), then what happens once the shop is made and where to get help.
 */
function SetupGuide({ press, helpUrl, answers, onOpen, onCreate }: {
  press: SetupPress; helpUrl: string; answers: HelpAnswers; onOpen: (page: string, anchor?: string) => void; onCreate: () => void;
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
  const go = (step: { id: string; page: string }) => (step.id === "open" ? onCreate() : onOpen(step.page, step.id === "domain" ? WEB_ADDRESS_ANCHOR : undefined));
  // A step's help answer, opened in place under its button.
  const [howOpen, setHowOpen] = useState("");
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="rp-setup-home">
      <PageHeader title={press.pressName ? `Welcome, ${press.pressName}` : "Welcome"}
        description="Nothing is charged, and your free days don't start, until you create your shop." />
      <div className="rp-sb">
      <div className="rp-sb-row">
        {next ? (
          <section className="rp-sb-tile rp-sb-big rp-sb-next" aria-labelledby="setup-next-title">
            <p className="rp-sb-eyebrow">Next step</p>
            <h2 id="setup-next-title">{w(next.title)}</h2>
            {STEP_WHY[next.id] && <p>{w(STEP_WHY[next.id])}</p>}
            <div className="rp-sb-actions">
              <button type="button" className="rp-sb-go" onClick={() => go(next)}>{next.action}</button>
            </div>
          </section>
        ) : <ReadyCard onCreate={onCreate} />}
        <ProgressTile done={done} total={total} title={ready ? "Ready to create" : `${total - done} ${total - done === 1 ? "step" : "steps"} to go`}
          lede={ready ? "Create your shop when you're ready." : "Each step saves as you go."}>
          {ready && <PrimaryButton icon={<Store size={16} aria-hidden />} onClick={onCreate}>Create my shop</PrimaryButton>}
        </ProgressTile>
      </div>
      <button type="button" className="rp-sb-toggle" aria-expanded={showAll} aria-controls="setup-all-steps" onClick={() => setShowAll((v) => !v)}>
        {showAll ? "Hide the list" : `See all ${total} steps`}<ChevronDown size={14} aria-hidden style={{ transform: showAll ? "rotate(180deg)" : undefined }} />
      </button>
      <section className="rp-sb" id="setup-all-steps" hidden={!showAll} aria-labelledby="setup-guide-title" style={{ marginBottom: 0 }}>
        <div className="rp-sb-head rp-sr-only">
          <div>
            <p className="rp-sb-eyebrow">Private · only you can see it</p>
            <h2 id="setup-guide-title" className="rp-sb-title" style={{ fontSize: "clamp(26px, 3vw, 34px)" }}>Setup guide</h2>
            <p className="rp-sb-lede">{ready ? "All set. Create your shop when you're ready." : "Each step saves as you go. Come back any time."}</p>
          </div>
          <p className="rp-sb-count" style={{ margin: 0 }}><span aria-hidden>{done} / {total}</span><span className="rp-sr-only">{done} of {total} done</span></p>
        </div>
        <div className="rp-sb-bar" role="progressbar" aria-label="Setup guide" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <span style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="rp-sb-groups">
        {setupGroups(steps).map((g) => (
        <section key={g.id} className="rp-sb-tile rp-sb-group" aria-labelledby={`setup-part-${g.id}`}>
          <h3 id={`setup-part-${g.id}`} className="rp-sb-group-head">
            <span>{g.title}</span><span>{g.done}/{g.total}<span className="rp-sr-only"> done</span></span>
          </h3>
        <ol aria-label={g.title} data-setup-steps="" className="rp-sb-steps">
          {g.steps.map((step) => {
            const isNext = step.id === next?.id;
            const isOpen = step.id === shown && !step.locked;
            const help = STEP_HELP[step.id];
            const panel = `guide-step-${step.id}`;
            return (
              <li key={step.id} className="rp-sb-step" aria-current={isNext ? "step" : undefined}
                data-open={isOpen ? "true" : undefined} data-done={step.done ? "true" : undefined} data-next={isNext && !step.done ? "true" : undefined}>
                <button type="button" aria-expanded={isOpen} aria-controls={panel} disabled={step.locked}
                  onClick={() => setPicked(isOpen ? "" : step.id)}>
                  <span aria-hidden className="rp-sb-dot">
                    {step.done ? <Check size={12} strokeWidth={3} /> : step.locked ? <Lock size={10} /> : null}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <strong className="rp-sb-step-title">{w(step.title)}</strong>
                    {step.optional && !step.done && <span className="rp-sb-tag"> · optional</span>}
                    <span className="rp-sr-only">{step.done ? " (done)" : step.locked ? " (comes with your shop)" : isNext ? " (next)" : ""}</span>
                  </span>
                  {step.locked
                    ? <span className="rp-hint" style={{ textAlign: "right", maxWidth: 120 }}>{step.action}</span>
                    : <ChevronDown size={16} aria-hidden style={{ transform: isOpen ? "rotate(180deg)" : undefined, color: "var(--rp-text-subtle)" }} />}
                </button>
                {isOpen && (
                  <div id={panel} className="rp-sb-panel">
                    {STEP_WHY[step.id] && <p>{w(STEP_WHY[step.id])}</p>}
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px" }}>
                      {step.done
                        ? <GhostButton size="sm" onClick={() => go(step)}>Change</GhostButton>
                        : <PrimaryButton size="sm" onClick={() => go(step)}>{step.action}</PrimaryButton>}
                      {help && answers.get(help) && (
                        <button type="button" className="rp-hint" aria-expanded={howOpen === step.id} aria-controls={`${panel}-how`}
                          onClick={() => setHowOpen(howOpen === step.id ? "" : step.id)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--rp-text)", textDecoration: "underline", textUnderlineOffset: 3, font: "inherit" }}>
                          How this works<ChevronDown size={12} aria-hidden style={{ transform: howOpen === step.id ? "rotate(180deg)" : undefined }} />
                        </button>
                      )}
                      {help && !answers.get(help) && (
                        <a className="rp-hint" href={helpLink(helpUrl, help)} target="_blank" rel="noopener"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--rp-text)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                          How this works<ExternalLink size={12} aria-hidden /><span className="rp-sr-only"> (opens in a new tab)</span>
                        </a>
                      )}
                    </div>
                    {help && howOpen === step.id && answers.get(help) && (
                      <div id={`${panel}-how`} style={{ padding: 12, background: "var(--rp-surface)", border: "1px solid var(--rp-border)", borderRadius: "var(--rp-radius, 0)" }}>
                        <HelpAnswer article={answers.get(help)!} helpUrl={helpUrl} />
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        </section>
        ))}
        </div>
      </section>
      </div>
    </div>
  );
}

/** Everything the shop needs is in: one clear card at the top of Home, so the last step can't be missed. */
function ReadyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rp-sb-tile rp-sb-big rp-sb-good" aria-labelledby="ready-title">
      <p className="rp-sb-eyebrow">Ready</p>
      <h2 id="ready-title">You're ready to create your shop</h2>
      <p>Everything your shop needs is in. It starts private, so only you can see it.</p>
      <div className="rp-sb-actions"><PrimaryButton icon={<Store size={16} aria-hidden />} onClick={onCreate}>Create my shop</PrimaryButton></div>
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
          <SelectField label="What you sell" value={sells} onChange={(e) => setSells(e.target.value)}>
            <option value="">Not said yet</option>
            {lists.sells.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </SelectField>
          <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Choose your country</option>
            {Object.entries(lists.countries).map(([code, c]) => <option key={code} value={code}>{c.name}</option>)}
          </SelectField>
          <SelectField label="Language of our emails" hint="Automatic: French in Quebec, English elsewhere."
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
        intro="It goes on your website when your shop is made."
        keep={press.look ? { label: `Keep ${themeName(press.look) || "my look"}`, onKeep: () => setChoosing(false) } : undefined}
        onDone={async (welcome) => {
          await save({ look: welcome.theme });
          setChoosing(false);
        }}
      />
    </>
  );
}

/**
 * Settings › Payments in setup: Stripe or Square for the website's card payments (cardProvider on the setup record).
 * The press connects the account itself once the shop is made; nothing is connected here. The words come from
 * cardChoice.ts.
 */
function CardPaymentsPage({ press, save }: { press: SetupPress; save: (c: SetupChange) => Promise<SetupPress> }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const inSetup = press.status === "setup";
  if (press.plan === "stockroom") {
    return (
      <>
        <PageHeader title="Payments" />
        <EmptyState title="No website on your plan" description="The stockroom on its own has no website checkout." />
      </>
    );
  }
  const chosen = chosenCardProvider(press);
  const choose = async (provider: CardProviderId) => {
    if (busy || (press.cardProvider === provider)) return;
    setBusy(provider); setError("");
    try { await save({ cardProvider: provider }); } catch (err) { setError(err instanceof Error ? err.message : "That didn't save. Try again."); } finally { setBusy(""); }
  };
  return (
    <>
      <PageHeader title="Payments" />
      <SectionCard title="Card payments" collapsible={false}>
        <div role="radiogroup" aria-label="Card payments" style={{ display: "grid", gap: 8 }}>
          {CARD_PROVIDER_CHOICES.map((option) => {
            const on = chosen === option.id;
            const unavailable = option.id === "square" && !squareAvailable(press.country);
            return (
              <button key={option.id} type="button" role="radio" aria-checked={on} disabled={!!busy || !inSetup || unavailable} onClick={() => void choose(option.id)}
                style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 12px", alignItems: "center", textAlign: "left", minHeight: 56, padding: "12px 14px",
                  background: on ? "var(--rp-primary-tint)" : "var(--rp-surface)", color: "var(--rp-text)", cursor: unavailable ? "not-allowed" : "pointer",
                  opacity: unavailable ? 0.6 : 1, border: on ? "2px solid var(--rp-text)" : "1px solid var(--rp-border)" }}>
                <BrandLogo id={option.id} size="md" />
                <span style={{ display: "grid", gap: 2 }}>
                  <strong>{option.name}</strong>
                  <span className="rp-hint">{unavailable ? "Not available in your country yet." : option.line}</span>
                </span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="rp-hint" style={{ color: "var(--rp-danger)" }}>{error}</p>}
        <p className="rp-hint" style={{ margin: "12px 0 0" }}>{inSetup ? CARD_CHOICE_NOTE : "Connect it in Settings › Payments once your shop is ready."}</p>
      </SectionCard>
    </>
  );
}

function PlanPage({ press, plans, failed, onRetry, save, termsUrl, names, email, createShop, onCreated, onOpen, follow, retry }: {
  press: SetupPress; plans: PlanList | null; failed: boolean; onRetry: () => void; save: (c: SetupChange) => Promise<SetupPress>;
  termsUrl: string; names: CreateNames; email: string; createShop: CreateShop; onCreated: (press: SetupPress) => void; onOpen: (page: string) => void;
  follow?: () => Promise<SetupPress | null>; retry?: (shopId: string) => Promise<void>;
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
      <PageHeader title="Plan" />
      <SectionCard title="Your plan" collapsible={false}>
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
      <CreateShopCard press={press} plans={plans} names={names} email={email} termsUrl={termsUrl} createShop={createShop} onCreated={onCreated} onOpen={onOpen} follow={follow} retry={retry} />
    </>
  );
}

/** Help in setup: the answers asked about most, opened in place, a person to ask, and the help centre. */
function HelpPage({ helpUrl, accountUrl, answers, ask, pressName }: {
  helpUrl: string; accountUrl: string; answers: HelpAnswers; ask: SetupDoor["askForHelp"]; pressName: string;
}) {
  const w = useShopWords();
  return (
    <>
      <PageHeader title="Help" description="Answers about setting up and creating your shop." />
      <SectionCard title="While you set up" collapsible={false}>
        <HelpQuestions questions={SETUP_QUESTIONS} answers={answers} helpUrl={helpUrl} ruled />
      </SectionCard>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
        <section id="ask" style={{ scrollMarginTop: 16 }}>
          <SectionCard title="Ask a person" description="A person answers in writing, by email." collapsible={false}>
            <AskForm ask={ask} pressName={pressName} accountUrl={accountUrl} />
          </SectionCard>
        </section>
        <SectionCard title="Help centre" collapsible={false}>
          <p style={{ marginTop: 0 }}>{w("Every answer, on plans, payments, moving your books in, and your website.")}</p>
          <a className="rp-btn rp-btn-secondary" href={helpUrl} target="_blank" rel="noopener">Open the help centre</a>
        </SectionCard>
      </div>
    </>
  );
}
