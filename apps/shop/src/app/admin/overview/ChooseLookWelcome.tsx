import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { libraryLook, newStarters, pressNameOf, type LibraryTheme, type StarterChoice } from "../lookGallery";
import type { WelcomeDone } from "../firstWeek";
import { friendlyError } from "../studio/friendlyError";
import { GhostButton, LoadingState, PrimaryButton, SecondaryButton, SectionCard } from "../riso/components";
import { shopKindOf, type LeadSide } from "../servicesSetup";
import type { StarterKind } from "../studio/starterDesign";
import { styledName } from "../studio/starterStyles";
import { firstColour, StarterCard } from "../StarterCards";
import { KIND_WORDS, startersForKind, starterTheme, type ShowAs } from "../websiteChoice";

// The full-screen preview carries the section list and the storefront hand-over: it loads on the first Preview.
const StarterPreview = lazy(() => import("../StarterPreview").then((m) => ({ default: m.StarterPreview })));

/** How many starters the shortlist shows on top. */
export const SHORTLIST = 3;

/**
 * Choose your website (plan "One website picker", step 4, 26 November 2026): the setup guide's first step on Home, and
 * setup mode's Design page. The same starter cards as Online store (StarterCards.tsx): a shortlist of three made for
 * the shop's kind on top, then the rest, each in its colour versions with Use this and Preview. No categories and no
 * older looks: changing the website later happens on Online store.
 * `settings` is settings/website as the Overview read it: undefined while it loads, null when it couldn't be read.
 * `onDone` gets what to record once the website is in the draft; the parent saves it (and puts the welcome away).
 */
export function ChooseLookWelcome({ publishes, settings, onDone, onRetrySettings, apply, intro: introWords, keep, chosen, settled = false, starters, kind: kindProp, lead }: {
  publishes?: string | null;
  settings: any;
  onDone: (welcome: WelcomeDone) => Promise<void>;
  onRetrySettings?: () => void;
  /** How the chosen website is put in place. The shop's admin puts it in Studio's draft and lets customer emails follow
   * it (the default); setup mode, with no shop yet, passes one that does nothing and keeps the choice on the press's
   * setup record through `onDone`. Setup mode also has no shop to preview, so its cards have no Preview. */
  apply?: (theme: LibraryTheme, settings: any, publishes?: string | null) => Promise<void>;
  /** The line under the title; the setup guide's step words by default. */
  intro?: string;
  /** When a website is already chosen: the way back that keeps it (in place of Skip, which would replace it). */
  keep?: { label: string; onKeep: () => void };
  /** The website the press chose before the shop was made (code plan 18.9): shown on its own first. */
  chosen?: { theme: string; style?: string } | null;
  /** The chosen website is already saved (setup mode's Design page): shown as "Your website", with no Use this on it. */
  settled?: boolean;
  /** The control room's starter choice (platformStarters.ts): which starters show, their order and New tags. */
  starters?: StarterChoice;
  /** The shop's kind (sign-up's answer, shop types plan); worked out from what it sells when left out. */
  kind?: StarterKind;
  /** Which half of a Both shop comes first. */
  lead?: LeadSide;
}) {
  const kind: StarterKind = kindProp ?? shopKindOf({ sells: publishes || null });
  const showAs: ShowAs = { kind, ...(kind === "both" && lead ? { lead } : {}) };
  const ids = useMemo(() => startersForKind(kind, starters), [kind, starters]);
  const fresh = useMemo(() => newStarters(starters), [starters]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>(() => (chosen?.style ? { [chosen.theme]: chosen.style } : {}));
  const [preview, setPreview] = useState<{ id: string; style: string | null } | null>(null);
  // Fetch the saving code while the press looks, so Use this answers at once (it brings the section list for the starter).
  useEffect(() => { if (!apply) void import("../chooseLook").catch(() => {}); }, [apply]);

  const press = pressNameOf(settings);
  const chosenStarter = chosen && ids.includes(chosen.theme) ? chosen.theme : null;
  // A website chosen before the shop was made that is no longer offered (an older look): it can still be used as it is.
  const chosenOlder = chosen && !chosenStarter ? libraryLook(chosen.theme) ?? null : null;
  const rest = ids.filter((id) => id !== chosenStarter);
  const shortlist = rest.slice(0, SHORTLIST);
  const more = rest.slice(SHORTLIST);
  const styleOf = (id: string) => picked[id] ?? firstColour(id, starters);
  const skipTo = chosenStarter || shortlist[0];

  const choose = async (theme: LibraryTheme | null, as: ShowAs = showAs, skipped = false) => {
    if (!theme || busy) return;
    setBusy(theme.id); setError("");
    try {
      if (apply) await apply(theme, settings, publishes);
      else {
        // Loaded only when used, so setup mode never loads the shop's database code.
        const shop = await import("../chooseLook");
        await shop.applyChosenLook(theme, settings, publishes, { kind: as.kind, lead: as.lead });
        await shop.followEmailTheme(theme.id);
      }
      await onDone({ theme: theme.id, at: new Date().toISOString(), ...(skipped ? { skipped: true } : {}) });
      setPreview(null);
      // The website is in the draft: in the shop's own admin, Studio opens on Make it yours (the steps after the pick,
      // studio/makeItYours.ts) beside the real preview. Skip keeps the owner on Home.
      if (typeof window !== "undefined" && !apply && !skipped) window.location.hash = "designer?yours=1";
    } catch (err) {
      setError(friendlyError(err, `use “${theme.name}”`));
    } finally { setBusy(null); }
  };
  const use = (id: string, style: string | null, as?: ShowAs) => choose(starterTheme(id, style), as);

  const intro = introWords ?? "Pick a website for your shop. It goes into your draft, and you can change it any time on Online store.";
  if (settings === undefined) return <SectionCard title="Choose your website" description={intro}><LoadingState label="Opening the websites…" /></SectionCard>;
  if (settings === null) {
    return (
      <SectionCard title="Choose your website" description={intro}>
        <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>Your shop's settings couldn't be read, so no website can be saved yet.</p>
        {onRetrySettings && <SecondaryButton size="sm" style={{ marginTop: 12 }} onClick={onRetrySettings}>Try again</SecondaryButton>}
      </SectionCard>
    );
  }

  const chosenName = chosenStarter ? styledName(starterTheme(chosenStarter, styleOf(chosenStarter))) : chosenOlder?.name;
  const title = settled && chosenName ? `Your website: ${chosenName}`
    : chosenName ? `Welcome to ${press}. Here's the website you chose`
    : `Welcome to ${press}. Choose your website`;
  const card = (id: string, own = false) => (
    <StarterCard key={id} id={id} style={styleOf(id)} onStyle={(s) => setPicked((p) => ({ ...p, [id]: s }))} choice={starters}
      isNew={fresh.includes(id)} busy={busy} onUse={own && settled ? undefined : (s) => void use(id, s)}
      onPreview={apply ? undefined : (s) => setPreview({ id, style: s })} />
  );
  const skip = keep
    ? <GhostButton size="sm" disabled={!!busy} onClick={keep.onKeep}>{keep.label}</GhostButton>
    : skipTo && <GhostButton size="sm" disabled={!!busy} onClick={() => void choose(starterTheme(skipTo, styleOf(skipTo)), showAs, true)}>Skip for now</GhostButton>;

  return (
    <SectionCard title={title} description={intro} collapsible={false} actions={skip || undefined}>
      <div className="rp-stack" data-testid="choose-website">
        {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}

        {chosenStarter && (
          <section aria-labelledby="website-chosen" className="rp-website-section">
            <h3 id="website-chosen" className="rp-website-section-title">{settled ? "Goes on your website when your shop is made" : "The website you chose"}</h3>
            <ul className="rp-website-grid" aria-label="The website you chose">{card(chosenStarter, true)}</ul>
          </section>
        )}
        {chosenOlder && (
          <div className="rp-website-back" role="status" data-testid="website-chosen-older">
            <span>{settled ? `${chosenOlder.name} goes on your website when your shop is made.` : `You chose ${chosenOlder.name} before your shop was made.`}</span>
            {!settled && <PrimaryButton size="sm" disabled={!!busy} onClick={() => void choose(chosenOlder)}>{busy === chosenOlder.id ? "Putting it in your draft…" : `Use ${chosenOlder.name}`}</PrimaryButton>}
          </div>
        )}

        {shortlist.length > 0 && (
          <section aria-labelledby="website-shortlist" className="rp-website-section">
            <div>
              <h3 id="website-shortlist" className="rp-website-section-title">{chosen ? "Or pick another" : "Picked for you"}</h3>
              <p className="rp-hint">Made for {KIND_WORDS[kind].toLowerCase()}. Each comes with its own layout and pages, and your {kind === "services" ? "services" : "products"}, words and logo take the samples' places.</p>
            </div>
            <ul className="rp-website-grid" aria-label="Your shortlist" data-guided-shortlist>{shortlist.map((id) => card(id))}</ul>
          </section>
        )}
        {more.length > 0 && (
          <section aria-labelledby="website-more" className="rp-website-section">
            <h3 id="website-more" className="rp-website-section-title">More websites</h3>
            <ul className="rp-website-grid" aria-label="More websites">{more.map((id) => card(id))}</ul>
          </section>
        )}
        {!ids.length && !chosenOlder && <p className="rp-hint" style={{ margin: 0 }}>No websites are offered right now. Your shop keeps its plain starting design, and you can choose one later on Online store.</p>}
        <p className="rp-hint" style={{ margin: 0 }}>Nothing changes for shoppers until you publish, and you can change your website any time on Online store.</p>
      </div>

      {preview && (
        <Suspense fallback={<div className="rp rp-starter-preview" role="status"><p className="rp-starter-preview-loading">Opening the preview…</p></div>}>
          <StarterPreview id={preview.id} style={preview.style} showAs={showAs} settings={settings} sells={publishes} choice={starters}
            onUse={(style, as) => void use(preview.id, style, as)} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </SectionCard>
  );
}
