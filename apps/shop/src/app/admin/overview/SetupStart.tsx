import { setRunLeft, setSetupShowing } from "./firstStep";
import { firstWeekSteps, showFirstWeek, type FirstWeekFacts } from "../firstWeek";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import type { FirstWeekDoc, WelcomeDone } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import { LoadingState, SecondaryButton, SectionCard } from "../riso/components";
import { platformCardsProvider, providerName, shopProfile } from "../../../lib/shopProfile";
import { auth } from "../../../lib/firebase";
import { SetupGuideCard } from "./SetupGuideCard";
import { PressDetailsStage } from "./PressDetailsStage";
import { policiesToFill } from "../pressDetails";
import { currentSells } from "../sells";
import { BringShopStage } from "./BringShopStage";
import type { BringMarker } from "../bringShop";
import { ownBooks } from "../lookGallery";
import { usePlatformStarters } from "../platformStarters";
import { ShippingStage } from "./ShippingStage";
import type { ShippingMarker } from "../shippingStage";
import type { FinalCheckMarker } from "../finalCheckStage";
import type { PaymentsMarker } from "../paymentsStage";
import { PaymentsStage } from "./PaymentsStage";
import { nextRunStep, runSteps } from "../startRun";
import { OpenListCard } from "./OpenListCard";
import { openRows, rowsLeft } from "../openList";
import { countryCode, countryName } from "../shippingCountries";
import { FinalCheckStage } from "./FinalCheckStage";
import { ShopOpenedCard, publicAddress } from "./ShopOpenedCard";
import { FirstOrderCard } from "./FirstOrderCard";
import { firstOrderToCelebrate } from "./firstOrder";
import { MoveProgressCard } from "./MoveProgressCard";
import { chosenDesign, chosenLook, keptFile, type SetupHandover } from "../setupHandover";
import { SignupDesignStage } from "./SignupDesignStage";
import { KeptFileCard } from "./KeptFileCard";
import { ServicesStage } from "./ServicesStage";
import { servicesOnly, type BookingsFacts } from "../servicesSetup";
import { OfferStage } from "./OfferStage";
import { offerSummary } from "../offerStage";
import { SERVICE_CHOICES } from "../WhatYouSellCard";
import { SELLS_CHANGED_EVENT } from "../shopWords";
import { GROUPS_CHANGED_EVENT } from "../productGroups";

// The welcome pulls in Studio's theme library and switcher, so it loads only for a shop that will show it.
const ChooseLookWelcome = lazy(() => import("./ChooseLookWelcome").then(m => ({ default: m.ChooseLookWelcome })));

/**
 * The top of a new shop's Overview: Get started's press details (plan 17.2) and Choose your look the first time (plan 6.3),
 * then Set up your shop (plan 6.9).
 * Both read the admin-only `firstWeek/start` the platform's setup writes; a shop without it shows neither.
 * `settings` is settings/website as the Overview read it: undefined while loading, null when it couldn't be read.
 */
export function SetupStart({ books, orders, readiness, settings, bookings, onOpen, onSetWall, onRetrySettings }: {
  /** A services shop's services and hours (undefined while loading and for every other shop; null when unreadable). */
  bookings?: BookingsFacts | null;
  books: any[] | null;
  orders: any[] | null;
  readiness: ReadinessItem[] | null;
  settings: any;
  onOpen?: (tab: string) => void;
  onSetWall?: (on: boolean) => Promise<boolean>;
  onRetrySettings?: () => void;
}) {
  const [doc, setDoc] = useState<FirstWeekDoc | null>(null);
  // Which whole-website starters the control room offers (control-room/starterSites.js).
  const starters = usePlatformStarters();
  // What the press set up before its shop existed (code plan 18.9); null for a shop made without setup.
  const [handover, setHandover] = useState<SetupHandover | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Set once Open your shop took the wall down here, so the step ticks before the Overview reads the settings again.
  const [opened, setOpened] = useState(false);
  const [pickLook, setPickLook] = useState(false);
  // "Your shop is open", shown from the moment it opens here until the press puts it away.
  const [celebrate, setCelebrate] = useState(false);
  // Set when the press chooses Finish later on the final check (plan 17.13): the setup guide shows until the next visit.
  const [finalLater, setFinalLater] = useState(false);
  const load = useCallback(() => {
    let live = true;
    setState("loading");
    // The hand-over only adds to the steps: when it can't be read, they work as they do for any shop.
    Promise.resolve().then(() => Promise.all([adminApi.getFirstWeek(), Promise.resolve().then(() => adminApi.getSetupHandover()).catch(() => null)]))
      .then(([d, h]) => { if (live) { setDoc(d); setHandover(h); setState("ready"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, []);
  useEffect(load, [load]);

  const platform = platformCardsProvider();
  const facts = useMemo(() => ({
    books, orders, readiness, platform, bookings,
    settings: opened && settings ? { ...settings, design: { ...settings.design, showUnderConstruction: false } } : settings,
  }), [books, orders, readiness, settings, opened, platform, bookings]);

  // Change 3: tell Home whether a setup step is on screen, so the tour offer and Connect Google wait their turn.
  const guideShowing = !!doc && showFirstWeek(doc, firstWeekSteps(doc, facts as FirstWeekFacts));
  // A shop that is already open (opened from Settings, or a test shop) has nothing left "to open": it gets the setup
  // guide, not the list. Opening it here in this visit keeps the list until the final check is recorded.
  const alreadyOpen = settings?.design?.showUnderConstruction === false && !opened;
  const runStep = doc && !alreadyOpen ? nextRunStep(doc, settings, platform) : null;
  // The first real order's own card (move 5), until the press puts it away.
  const firstOrder = doc && !runStep ? firstOrderToCelebrate(orders, doc.done?.firstOrder) : null;
  const showing = state === "loading" ? null : state === "error" || (!!doc && (!!runStep || guideShowing || celebrate || !!firstOrder));
  useEffect(() => { setSetupShowing(showing); }, [showing]);
  // The top bar's "Open · N to go" counts the same rows as the list (move 4); null hands it back to Ready to sell.
  const left = doc && runStep && runStep !== "final" ? rowsLeft(openRows(runSteps(platform, servicesOnly(doc)), runStep)) : null;
  useEffect(() => { if (state !== "loading") setRunLeft(left); }, [left, state]);
  useEffect(() => () => setSetupShowing(false), []);

  // A shop setup never wrote a document for (most shops made before the platform) sees nothing while it loads.
  if (state === "loading") return null;
  if (state === "error") {
    return (
      <SectionCard title="Set up your shop" collapsible={false}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your setup steps couldn't be read. Check your connection.</p>
        <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={load}>Try again</SecondaryButton>
      </SectionCard>
    );
  }
  if (!doc) return null;

  // The file kept in setup, for a press that got past the bring step before it reached the shop (code plan 18.9).
  const lateFile = keptFile(handover);
  const showLateFile = !!lateFile && !!doc.bring && !doc.done?.setupFile && !!books;
  const lateFileDone = async () => {
    const at = new Date().toISOString();
    await adminApi.updateFirstWeek({ done: { setupFile: at } });
    setDoc({ ...doc, done: { ...doc.done, setupFile: at } });
  };
  // Get started's steps in order (startRun.ts): the look, your products, Get paid, contact and shipping, open your shop.
  const step = runStep;
  const inRun = !!step && !(step === "final" && finalLater);
  // The one list on Home (move 4): the run's rows, with the facts sign-up already gave.
  const shopName = settings?.info?.name || shopProfile.name;
  const code = typeof doc.country === "string" && countryCode(doc.country) ? doc.country : "";
  const look = (doc.welcome as WelcomeDone | undefined)?.theme || chosenLook(handover)?.theme;
  const rows = inRun ? openRows(runSteps(platform, servicesOnly(doc)), step, {
    email: auth?.currentUser?.email, name: shopName, country: code ? countryName(code) : "", look,
    lookStyle: chosenLook(handover)?.theme === look ? chosenLook(handover)?.style : "", provider: platform,
    offer: doc.offer ? offerSummary(doc, (id) => SERVICE_CHOICES.find((c) => c.id === id)?.label ?? "Services") : null,
  }) : null;
  const stage = () => {
    if (step === "offer") {
      // Step 1 (shop types plan): what the shop sells or what people book. The menu and words follow at once.
      const offerDone = async (change: Parameters<typeof adminApi.updateFirstWeek>[0]) => {
        await adminApi.updateFirstWeek(change);
        setDoc({ ...doc, ...change } as FirstWeekDoc);
        if (change.sells) window.dispatchEvent(new CustomEvent(SELLS_CHANGED_EVENT, { detail: change.sells }));
        if (change.productGroups) window.dispatchEvent(new CustomEvent(GROUPS_CHANGED_EVENT, { detail: change.productGroups }));
      };
      return <OfferStage doc={doc} onDone={offerDone} />;
    }
    if (step === "details") {
      const detailsDone = async (at: string) => {
        await adminApi.updateFirstWeek({ details: { at } });
        setDoc({ ...doc, details: { at } });
      };
      // The brand name and country sign-up asked are not asked again (sign-up plan, move 2).
      const known = { name: shopProfile.name, country: doc.country, email: auth?.currentUser?.email };
      // The store policies opening needs come filled in with these details (move 4: check, don't write).
      const fill = { keys: policiesToFill(servicesOnly(doc)), sells: currentSells(doc), cards: providerName() };
      return <PressDetailsStage settings={settings} known={known} fill={fill} onDone={detailsDone} onRetrySettings={onRetrySettings} />;
    }
    if (step === "bring") {
      // Step 2 (plan 17.3): where the press sells now, and its products brought over (or started fresh).
      // A press offered its file from setup has made its choice here, so the later card never shows.
      const bringDone = async (bring: BringMarker) => {
        const offered = lateFile ? { done: { setupFile: bring.at } } : {};
        await adminApi.updateFirstWeek({ bring, ...offered });
        setDoc({ ...doc, bring, ...(lateFile ? { done: { ...doc.done, setupFile: bring.at } } : {}) });
      };
      return <BringShopStage books={books} onDone={bringDone} kept={keptFile(handover)} />;
    }
    if (step === "services") {
      // A services shop's step 2: what clients can book. Recorded where the products step is, so it never shows twice.
      const servicesDone = async (bring: BringMarker) => {
        await adminApi.updateFirstWeek({ bring });
        setDoc({ ...doc, bring });
      };
      return <ServicesStage bookings={bookings} onDone={servicesDone} onOpen={onOpen} />;
    }
    if (step === "look") {
      // `firstRun` tells this run from an older shop's welcome (startRun.ts): the look now comes first.
      const done = async (picked: WelcomeDone) => {
        const welcome = { ...picked, firstRun: true };
        await adminApi.updateFirstWeek({ welcome });
        setDoc({ ...doc, welcome });
      };
      // Designed before the store was made: that design goes on, unless the press chose the gallery instead.
      const designed = chosenDesign(handover);
      if (designed && !pickLook) {
        if (settings === undefined) return <SectionCard title="Your design" collapsible={false}><LoadingState label="Opening your shop…" /></SectionCard>;
        return <SignupDesignStage design={designed} settings={settings} onDone={done} onPickLook={() => setPickLook(true)} />;
      }
      return (
        <Suspense fallback={<SectionCard title="Choose your look"><LoadingState label="Opening the looks…" /></SectionCard>}>
          <ChooseLookWelcome publishes={doc.publishes} books={ownBooks(books)} settings={settings} onDone={done} onRetrySettings={onRetrySettings} chosen={chosenLook(handover)} starters={starters} />
        </Suspense>
      );
    }
    // The steps after this read the shop's settings, so they wait for them rather than show an empty address or a wrong open state.
    if (step && settings === undefined) return <SectionCard title="Get started" collapsible={false}><LoadingState label="Opening your shop…" /></SectionCard>;
    if (step === "payments" && platform) {
      // Plan 17.10: Get paid, through the press's own card account the platform connects.
      const paymentsDone = async (payments: PaymentsMarker) => {
        await adminApi.updateFirstWeek({ payments });
        setDoc({ ...doc, payments });
      };
      return <PaymentsStage provider={platform} onDone={paymentsDone} />;
    }
    if (step === "shipping") {
      // Plan 17.11: shipping. A shop that already has shipping and a full address passes it by itself.
      const shippingDone = async (shipping: ShippingMarker) => {
        await adminApi.updateFirstWeek({ shipping });
        setDoc({ ...doc, shipping });
      };
      return <ShippingStage settings={settings} onDone={shippingDone} onOpen={onOpen} />;
    }
    // Plan 17.13: the final check and open. "Finish later" shows the setup guide for now, without recording anything.
    if (step === "final" && !finalLater) {
      const finalDone = async (finalCheck: FinalCheckMarker) => {
        await adminApi.updateFirstWeek({ finalCheck });
        setDoc({ ...doc, finalCheck });
      };
      const openNow = async () => {
        if (!onSetWall) return false;
        const ok = await onSetWall(false);
        if (ok) { setOpened(true); setCelebrate(true); }
        return ok;
      };
      return <FinalCheckStage readiness={readiness} address={publicAddress(settings)} onOpen={onOpen} onOpenShop={openNow} onDone={finalDone} onFinishLater={() => setFinalLater(true)} />;
    }

    const setWall = onSetWall && (async (on: boolean) => {
      const ok = await onSetWall(on);
      if (ok && !on) { setOpened(true); setCelebrate(true); }
      return ok;
    });
    const firstOrderDone = async () => {
      const at = new Date().toISOString();
      await adminApi.updateFirstWeek({ done: { firstOrder: at } });
      setDoc({ ...doc, done: { ...doc.done, firstOrder: at } });
    };
    return (
      <>
        {firstOrder && <FirstOrderCard order={firstOrder} onDone={firstOrderDone} onOpen={onOpen} />}
        {celebrate && <ShopOpenedCard address={publicAddress(settings)} name={settings?.info?.name} moved={doc.sellingToday === "online"} onOpen={onOpen} onClose={() => setCelebrate(false)} />}
        <SetupGuideCard doc={doc} setDoc={setDoc} facts={facts} onOpen={onOpen} onSetWall={setWall} />
        <MoveProgressCard doc={doc} setDoc={setDoc} onOpen={onOpen} />
      </>
    );
  };
  return (
    <>
      {showLateFile && <KeptFileCard books={books!} kept={lateFile!} onDone={lateFileDone} />}
      {inRun ? <OpenListCard rows={rows!} name={shopName} final={step === "final"}>{stage()}</OpenListCard> : stage()}
    </>
  );
}
