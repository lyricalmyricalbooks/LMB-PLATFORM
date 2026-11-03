import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import type { FirstWeekDoc, WelcomeDone } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import { LoadingState, SecondaryButton, SectionCard } from "../riso/components";
import { platformCardsProvider } from "../../../lib/shopProfile";
import { SetupGuideCard } from "./SetupGuideCard";
import { PressDetailsStage } from "./PressDetailsStage";
import { BringShopStage } from "./BringShopStage";
import type { BringMarker } from "../bringShop";
import { ownBooks } from "../chooseLook";
import { ShippingStage } from "./ShippingStage";
import type { ShippingMarker } from "../shippingStage";
import type { FinalCheckMarker } from "../finalCheckStage";
import type { GoogleMarker } from "../googleStage";
import type { PaymentsMarker } from "../paymentsStage";
import { PaymentsStage } from "./PaymentsStage";
import { nextRunStep } from "../startRun";
import { GoogleStage } from "./GoogleStage";
import { FinalCheckStage } from "./FinalCheckStage";
import { ShopOpenedCard, publicAddress } from "./ShopOpenedCard";
import { MoveProgressCard } from "./MoveProgressCard";

// The welcome pulls in Studio's theme library and switcher, so it loads only for a shop that will show it.
const ChooseLookWelcome = lazy(() => import("./ChooseLookWelcome").then(m => ({ default: m.ChooseLookWelcome })));

/**
 * The top of a new shop's Overview: Get started's press details (plan 17.2) and Choose your look the first time (plan 6.3),
 * then Set up your shop (plan 6.9).
 * Both read the admin-only `firstWeek/start` the platform's setup writes; a shop without it shows neither.
 * `settings` is settings/website as the Overview read it: undefined while loading, null when it couldn't be read.
 */
export function SetupStart({ books, orders, readiness, settings, onOpen, onSetWall, onRetrySettings }: {
  books: any[] | null;
  orders: any[] | null;
  readiness: ReadinessItem[] | null;
  settings: any;
  onOpen?: (tab: string) => void;
  onSetWall?: (on: boolean) => Promise<boolean>;
  onRetrySettings?: () => void;
}) {
  const [doc, setDoc] = useState<FirstWeekDoc | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Set once Open your shop took the wall down here, so the step ticks before the Overview reads the settings again.
  const [opened, setOpened] = useState(false);
  // "Your shop is open", shown from the moment it opens here until the press puts it away.
  const [celebrate, setCelebrate] = useState(false);
  // Set when the press chooses Finish later on the final check (plan 17.13): the setup guide shows until the next visit.
  const [finalLater, setFinalLater] = useState(false);
  const load = useCallback(() => {
    let live = true;
    setState("loading");
    Promise.resolve().then(() => adminApi.getFirstWeek())
      .then(d => { if (live) { setDoc(d); setState("ready"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, []);
  useEffect(load, [load]);

  const platform = platformCardsProvider();
  const facts = useMemo(() => ({
    books, orders, readiness, platform,
    settings: opened && settings ? { ...settings, design: { ...settings.design, showUnderConstruction: false } } : settings,
  }), [books, orders, readiness, settings, opened, platform]);

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

  // Get started's steps in order (startRun.ts): your press, bring your shop, the look, Google, Get paid, shipping, the final check.
  const step = nextRunStep(doc, settings, platform);
  if (step === "details") {
    const detailsDone = async (at: string) => {
      await adminApi.updateFirstWeek({ details: { at } });
      setDoc({ ...doc, details: { at } });
    };
    return <PressDetailsStage settings={settings} onDone={detailsDone} onRetrySettings={onRetrySettings} />;
  }
  if (step === "bring") {
    // Step 2 (plan 17.3): where the press sells now, and its products brought over (or started fresh).
    const bringDone = async (bring: BringMarker) => {
      await adminApi.updateFirstWeek({ bring });
      setDoc({ ...doc, bring });
    };
    return <BringShopStage books={books} onDone={bringDone} />;
  }
  if (step === "look") {
    const done = async (welcome: WelcomeDone) => {
      await adminApi.updateFirstWeek({ welcome });
      setDoc({ ...doc, welcome });
    };
    return (
      <Suspense fallback={<SectionCard title="Choose your look"><LoadingState label="Opening the looks…" /></SectionCard>}>
        <ChooseLookWelcome publishes={doc.publishes} books={ownBooks(books)} settings={settings} onDone={done} onRetrySettings={onRetrySettings} />
      </Suspense>
    );
  }
  // The steps after this read the shop's settings, so they wait for them rather than show an empty address or a wrong open state.
  if (step && settings === undefined) return <SectionCard title="Get started" collapsible={false}><LoadingState label="Opening your shop…" /></SectionCard>;
  if (step === "google") {
    // Step 4 (plan 17.9): Google in one sign-in; coming soon until Google approves it, and never a blocker.
    const googleDone = async (google: GoogleMarker) => {
      await adminApi.updateFirstWeek({ google });
      setDoc({ ...doc, google });
    };
    return <GoogleStage onDone={googleDone} />;
  }
  if (step === "payments" && platform) {
    // Step 5 (plan 17.10): Get paid, through the press's own card account the platform connects.
    const paymentsDone = async (payments: PaymentsMarker) => {
      await adminApi.updateFirstWeek({ payments });
      setDoc({ ...doc, payments });
    };
    return <PaymentsStage provider={platform} onDone={paymentsDone} />;
  }
  if (step === "shipping") {
    // Step 6 (plan 17.11): shipping and the address.
    const shippingDone = async (shipping: ShippingMarker) => {
      await adminApi.updateFirstWeek({ shipping });
      setDoc({ ...doc, shipping });
    };
    return <ShippingStage settings={settings} onDone={shippingDone} onOpen={onOpen} />;
  }
  // Step 8 (plan 17.13): the final check and open. "Finish later" shows the setup guide for now, without recording anything.
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
    return <FinalCheckStage readiness={readiness} onOpen={onOpen} onOpenShop={openNow} onDone={finalDone} onFinishLater={() => setFinalLater(true)} />;
  }

  const setWall = onSetWall && (async (on: boolean) => {
    const ok = await onSetWall(on);
    if (ok && !on) { setOpened(true); setCelebrate(true); }
    return ok;
  });
  return (
    <>
      {celebrate && <ShopOpenedCard address={publicAddress(settings)} onClose={() => setCelebrate(false)} />}
      <SetupGuideCard doc={doc} setDoc={setDoc} facts={facts} onOpen={onOpen} onSetWall={setWall} />
      <MoveProgressCard doc={doc} setDoc={setDoc} onOpen={onOpen} />
    </>
  );
}
