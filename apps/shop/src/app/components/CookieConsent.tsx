import { regionProps } from "../features/site/storefrontRegions";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { m, AnimatePresence } from "motion/react";
import { StorefrontThemeStyle } from "../features/site/StorefrontThemeStyle";
import { useLiveDesign } from "../features/site/useSiteData";
import { getCopy } from "../features/site/storeCopy";
import { useStudioOverlay } from "../features/site/studioOverlay";

const STORAGE_KEY = "lm:cookie-consent";

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
};

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Consent) : null;
  } catch {
    return null;
  }
}

function writeConsent(c: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    window.dispatchEvent(new CustomEvent("lm:consent-change", { detail: c }));
  } catch {
    // localStorage unavailable; nothing we can do
  }
}

export function CookieConsent() {
  const [decided, setDecided] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const design = useLiveDesign();
  const c = (key: string) => getCopy(design, key);
  // The admin is the owner's own workspace (and on phones the banner would cover its bottom bar): no banner there.
  const onAdmin = /^\/admin(?:\/|$)/.test(useLocation().pathname);

  // Studio preview: Studio opens the banner on request (Page layout › Pop-overs › Cookie banner) even when
  // this browser has already answered it, and an answer given in the preview is never saved.
  const inPreview = typeof window !== "undefined" && window.location.search.includes("preview=true");
  useStudioOverlay("cookie", open => { if (inPreview) setDecided(!open); });

  useEffect(() => {
    // In the Studio preview the banner opens only when Studio asks for it, so it never covers the part being edited.
    if (inPreview) return;
    const existing = readConsent();
    setDecided(!!existing);
    if (existing) {
      setAnalytics(existing.analytics);
      setMarketing(existing.marketing);
    }
  }, []);

  const decide = (accepted: { analytics: boolean; marketing: boolean }) => {
    if (inPreview) { setDecided(true); return; }
    writeConsent({
      necessary: true,
      analytics: accepted.analytics,
      marketing: accepted.marketing,
      decidedAt: new Date().toISOString(),
    });
    setDecided(true);
  };

  if (design?.showCookieBanner === false || onAdmin) return null;
  // Phones get a compact banner (smaller heading, tighter spacing, all buttons on one row when they fit) so it
  // covers about a quarter of the screen; from 768px up every class below is exactly the desktop look.
  const btn = "max-md:min-h-11 max-md:max-w-full max-md:whitespace-nowrap border-2 border-[var(--rp-outline)] px-2.5 py-3 text-[10px] font-black uppercase tracking-[0.08em] md:px-4 md:tracking-[0.2em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rp-focus)]";
  const primary = `flex-1 md:min-w-[130px] ${btn} bg-[var(--btn-bg)] text-[var(--btn-text)] shadow-[3px_3px_0_var(--rp-shadow-color)] transition-transform hover:-translate-y-0.5`;
  return (
    <AnimatePresence>
      {!decided && (
        <m.div {...regionProps("cookiePanel")}
          data-fm-store
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-label={c("cookieAria")}
          aria-modal="false"
          className="fixed bottom-3 left-2 right-2 z-[150] overflow-hidden border-2 border-[var(--rp-outline)] bg-[var(--bg-color)] p-4 text-[rgb(var(--fg-rgb))] shadow-[6px_6px_0_var(--rp-shadow-color)] md:bottom-7 md:left-auto md:right-8 md:max-w-[30rem] md:p-6"
        >
          <StorefrontThemeStyle design={design} />
          <p {...regionProps("cookieTag")} className="mb-2 inline-flex -rotate-1 border-2 border-[var(--rp-outline)] bg-[var(--warning)] px-2.5 py-1 text-[9px] md:mb-3 md:px-3 md:py-1.5 font-black uppercase tracking-[0.28em] text-[var(--on-accent,#100f0d)] shadow-[3px_3px_0_var(--rp-shadow-color)]">
            {c("cookieTag")}
          </p>
          <h2 {...regionProps("cookieHeading")} className="mb-1.5 text-2xl uppercase leading-none md:mb-2 md:text-3xl" style={{ fontFamily: "var(--heading-font, 'Anton', Impact, sans-serif)", fontWeight: 400 }}>
            {c("cookieHeading")} <span className="text-[var(--accent)]">{c("cookieHeadingAccent")}</span>
          </h2>
          <p {...regionProps("cookieBody")} className="mb-3 max-w-md text-[13px] font-medium leading-snug text-[var(--muted)] md:mb-5 md:text-sm md:leading-relaxed">
            {c("cookieBody")}
          </p>

          {showDetails && (
            <div {...regionProps("cookieChoices")} className="mb-3 space-y-2 border-y-2 border-[var(--rp-outline)] py-3 text-xs text-[var(--muted)] md:mb-5 md:py-4">
              <label className="flex items-start gap-3 opacity-60">
                <input type="checkbox" checked disabled className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  <strong className="text-[rgb(var(--fg-rgb))]">{c("cookieNecessary")}</strong> — {c("cookieNecessaryText")}
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={e => setAnalytics(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  <strong className="text-[rgb(var(--fg-rgb))]">{c("cookieAnalytics")}</strong> — {c("cookieAnalyticsText")}
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={e => setMarketing(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  <strong className="text-[rgb(var(--fg-rgb))]">{c("cookieMarketing")}</strong> — {c("cookieMarketingText")}
                </span>
              </label>
            </div>
          )}

          <div {...regionProps("cookieActions")} className="flex flex-wrap gap-1.5 md:gap-2.5">
            <button onClick={() => decide({ analytics: true, marketing: true })} className={primary}>
              {c("cookieAcceptAll")}
            </button>
            <button
              onClick={() => decide({ analytics: false, marketing: false })}
              className={`flex-1 md:min-w-[120px] ${btn} bg-[rgb(var(--fg-rgb))] text-[var(--bg-color)] transition-colors hover:bg-[var(--warning)] hover:text-[var(--on-accent,#100f0d)]`}
            >
              {c("cookieReject")}
            </button>
            {showDetails ? (
              <button onClick={() => decide({ analytics, marketing })} className={primary}>
                {c("cookieSave")}
              </button>
            ) : (
              <button
                onClick={() => setShowDetails(true)}
                className="max-md:min-h-11 max-md:shrink-0 max-md:whitespace-nowrap px-1.5 py-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--muted)] md:px-3 md:tracking-[0.22em] underline decoration-2 underline-offset-4 transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rp-focus)]"
              >
                {c("cookieCustomize")}
              </button>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}

export default CookieConsent;
