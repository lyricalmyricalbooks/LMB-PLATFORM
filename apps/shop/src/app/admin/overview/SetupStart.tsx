import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../api";
import { welcomeShows } from "../chooseLook";
import type { FirstWeekDoc, WelcomeDone } from "../firstWeek";
import type { ReadinessItem } from "../launchReadiness";
import { LoadingState, SecondaryButton, SectionCard } from "../riso/components";
import { platformCardsProvider } from "../../../lib/shopProfile";
import { SetupGuideCard } from "./SetupGuideCard";
import { PressDetailsStage } from "./PressDetailsStage";

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
  const load = useCallback(() => {
    let live = true;
    setState("loading");
    Promise.resolve().then(() => adminApi.getFirstWeek())
      .then(d => { if (live) { setDoc(d); setState("ready"); } })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, []);
  useEffect(load, [load]);

  const facts = useMemo(() => ({
    books, orders, readiness, platform: platformCardsProvider(),
    settings: opened && settings ? { ...settings, design: { ...settings.design, showUnderConstruction: false } } : settings,
  }), [books, orders, readiness, settings, opened]);

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

  if (welcomeShows(doc)) {
    // Get started runs its steps in order: the press's details (plan 17.2), then the look.
    if (!doc.details) {
      const detailsDone = async (at: string) => {
        await adminApi.updateFirstWeek({ details: { at } });
        setDoc({ ...doc, details: { at } });
      };
      return <PressDetailsStage settings={settings} onDone={detailsDone} onRetrySettings={onRetrySettings} />;
    }
    const done = async (welcome: WelcomeDone) => {
      await adminApi.updateFirstWeek({ welcome });
      setDoc({ ...doc, welcome });
    };
    return (
      <Suspense fallback={<SectionCard title="Choose your look"><LoadingState label="Opening the looks…" /></SectionCard>}>
        <ChooseLookWelcome publishes={doc.publishes} settings={settings} onDone={done} onRetrySettings={onRetrySettings} />
      </Suspense>
    );
  }

  const setWall = onSetWall && (async (on: boolean) => {
    const ok = await onSetWall(on);
    if (ok && !on) setOpened(true);
    return ok;
  });
  return <SetupGuideCard doc={doc} setDoc={setDoc} facts={facts} onOpen={onOpen} onSetWall={setWall} />;
}
