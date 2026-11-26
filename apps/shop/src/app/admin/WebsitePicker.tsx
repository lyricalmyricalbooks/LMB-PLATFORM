// Online store's website picker (plan "One website picker", 26 November 2026): the shop's website with its colour
// versions, the other starters shown as this kind of shop, a full-screen Preview, Use this, and Switch back for 30 days.
// The rules (which starters, in what order, what switching back keeps) live in websiteChoice.ts.
import { lazy, Suspense, useEffect, useState } from "react";
import { adminApi } from "./api";
import { openWorkspace } from "./themeStore";
import { usePlatformStarters } from "./platformStarters";
import { newStarters } from "./lookGallery";
import { leadSideOf, shopKindOf } from "./servicesSetup";
import { Dialog, PrimaryButton, SecondaryButton, StatusBadge, useRisoToast } from "./riso/components";
import type { SavedTheme } from "./studio/savedThemes";
import { styledName } from "./studio/starterStyles";
import { starterUpdate, type StarterUpdate } from "./studio/themeSwitch";
import type { StarterKind } from "./studio/starterDesign";
import type { StudioLocation } from "../lib/studioLocation";
import {
  coloursOf, currentWebsite, KIND_WORDS, ownSavedDesigns, startersForKind, STARTER_BLURB, starterTheme, switchBackOffer,
  switchBackUntil, thumbUrl, type CurrentWebsite, type ShowAs, type SwitchBack,
} from "./websiteChoice";

// The full-screen preview carries the section list and the storefront hand-over: it loads on the first Preview.
const StarterPreview = lazy(() => import("./StarterPreview").then((m) => ({ default: m.StarterPreview })));
const actions = () => import("./chooseLook");

type Props = { settings: any; onOpenStudio: (at?: StudioLocation) => void };

function Colours({ id, value, onPick, choice, label }: { id: string; value: string | null; onPick: (style: string) => void; choice: any; label: string }) {
  const colours = coloursOf(id, choice);
  if (colours.length < 2) return null;
  return (
    <div role="radiogroup" aria-label={label} className="rp-colour-chips">
      {colours.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={s.id === value} className="rp-colour-chip" onClick={() => onPick(s.id)}>
          <span aria-hidden className="rp-colour-dots">{s.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</span>{s.name}
        </button>
      ))}
    </div>
  );
}

function Shot({ id, style, name, big }: { id: string; style: string | null; name: string; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="rp-website-shot" data-big={big || undefined}>
      {broken ? <span className="rp-website-shot-missing">{name}</span>
        : <img src={thumbUrl(id, style)} alt={`${name}, its home page on a computer`} loading={big ? "eager" : "lazy"} decoding="async" onError={() => setBroken(true)} />}
    </div>
  );
}

export function WebsitePicker({ settings, onOpenStudio }: Props) {
  const toast = useRisoToast();
  const choice = usePlatformStarters();
  const live = currentWebsite(settings?.design);
  const [draft, setDraft] = useState<CurrentWebsite | null>(null);
  const [update, setUpdate] = useState<StarterUpdate | null>(null);
  const [switchBack, setSwitchBack] = useState<SwitchBack | null>(null);
  const [saved, setSaved] = useState<SavedTheme[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [kind, setKind] = useState<StarterKind>("products");
  const [lead, setLead] = useState<ShowAs["lead"]>();
  const [sells, setSells] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ id: string; style: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => openWorkspace(settings).then((ws) => {
    setDraft(currentWebsite(ws.draft));
    setUpdate(ws.draft ? starterUpdate(ws.draft) : null);
    setSwitchBack(switchBackOffer(ws.savedThemes));
    setSaved(ownSavedDesigns(ws.savedThemes));
  }).catch(() => {});
  useEffect(() => {
    void load();
    // What the shop sells sets the kind its starters are shown as (sign-up's answer, shop types plan).
    adminApi.getFirstWeek().then((doc: any) => {
      if (!doc) return;
      setSells(doc.sells || doc.publishes || null);
      const k = shopKindOf(doc);
      setKind(k);
      if (k === "both") setLead(leadSideOf(doc));
    }).catch(() => {});
  }, []);

  // The website the owner is working on: the draft's when it differs from the live one.
  const mine = draft && draft.id !== live.id ? draft : live;
  const pending = !!draft && (draft.id !== live.id || draft.style !== live.style);
  const mineStyle = picked[mine.id || ""] ?? mine.style;
  const fresh = newStarters(choice);
  const others = startersForKind(kind, choice).filter((id) => id !== mine.id);
  const showAs: ShowAs = { kind, ...(lead ? { lead } : {}) };

  const use = async (id: string, style: string | null, as: ShowAs = showAs) => {
    const theme = starterTheme(id, style);
    if (!theme || busy) return;
    setBusy(id);
    try {
      await (await actions()).applyChosenLook(theme, settings, sells, { kind: as.kind, lead: as.lead, keepBefore: true });
      setPreview(null);
      toast?.(`${styledName(theme)} is in your draft. Look it over in Studio, then Publish when you're happy.`, { tone: "ok" });
      onOpenStudio({ templateId: "heroPage" });
    } catch {
      toast?.("That website couldn't be put in your draft. Nothing changed. Try again in a moment.", { tone: "err" });
    } finally { setBusy(null); }
  };
  const recolour = async (style: string) => {
    if (!mine.id || busy) return;
    setPicked((p) => ({ ...p, [mine.id!]: style }));
    const theme = starterTheme(mine.id, style);
    setBusy("colours");
    try {
      await (await actions()).applyColours(theme, settings);
      await load();
      toast?.(`${styledName(theme)} colours are in your draft. Publish in Studio to make them live.`, { tone: "ok" });
    } catch {
      setPicked((p) => ({ ...p, [mine.id!]: mine.style || "" }));
      toast?.("The colours couldn't be changed. Nothing changed. Try again in a moment.", { tone: "err" });
    } finally { setBusy(null); }
  };
  const goBack = async () => {
    if (busy) return;
    setBusy("back");
    try {
      const name = await (await actions()).switchBackWebsite(settings);
      await load();
      toast?.(name ? `${name} is back in your draft. Publish in Studio to make it live.` : "There's nothing to switch back to any more.", { tone: name ? "ok" : "warn" });
    } catch {
      toast?.("Couldn't switch back just now. Nothing changed. Try again in a moment.", { tone: "err" });
    } finally { setBusy(null); }
  };

  // Online store › Bring one back: a design saved before My themes was retired goes back into the draft.
  const bringBack = async (t: SavedTheme) => {
    if (busy) return;
    setBusy(`saved:${t.id}`);
    try {
      await (await actions()).bringBackSaved(t, settings);
      await load();
      setSavedOpen(false);
      toast?.(`${t.name} is back in your draft. Look it over in Studio, then Publish when you're happy.`, { tone: "ok" });
    } catch {
      toast?.("That design couldn't be put in your draft. Nothing changed. Try again in a moment.", { tone: "err" });
    } finally { setBusy(null); }
  };
  // Remove asks once on the row itself ("Remove for good"), then deletes the saved design.
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (t: SavedTheme) => {
    if (removing !== t.id) { setRemoving(t.id); return; }
    setBusy(`remove:${t.id}`);
    try {
      await (await actions()).removeSaved(t.id, settings);
      await load();
      toast?.(`${t.name} was removed.`, { tone: "ok" });
    } catch {
      toast?.("That design couldn't be removed. Try again in a moment.", { tone: "err" });
    } finally { setBusy(null); setRemoving(null); }
  };
  const savedCount = saved.length;

  return (
    <>
      <section className="rp-cardbox rp-website-mine" aria-labelledby="website-mine" data-testid="your-website">
        {switchBack && (
          <div className="rp-website-back" role="status">
            <span>You changed to {switchBack.to}. You can switch back to {switchBack.from} until {switchBackUntil(switchBack)}.</span>
            <SecondaryButton size="sm" onClick={goBack} disabled={!!busy}>{busy === "back" ? "Switching back…" : `Switch back to ${switchBack.from}`}</SecondaryButton>
          </div>
        )}
        {update && (
          <div className="rp-website-back" role="status" data-testid="website-update">
            <span>A new version of {update.name} is ready. {update.releases[0]?.note} Your own changes stay on top.</span>
            <SecondaryButton size="sm" onClick={() => onOpenStudio({ starter: true })}>See what's new</SecondaryButton>
          </div>
        )}
        <div className="rp-website-mine-grid" data-own={!mine.id || undefined}>
          {mine.id && <Shot id={mine.id} style={mineStyle} name={mine.name} big />}
          <div className="rp-website-mine-words">
            <span className="rp-website-label">Your website</span>
            <h2 id="website-mine" className="rp-website-name">{mine.name}</h2>
            {pending && <StatusBadge tone="warning" glyph={false}>In your draft, not live yet</StatusBadge>}
            <p className="rp-hint">{mine.id ? STARTER_BLURB[mine.id] : "Your shop keeps the design it has. Choose a website below to start from one of ours."}</p>
            {mine.id && (
              <div className="rp-website-colours">
                <span className="rp-website-sub">Colours</span>
                <Colours id={mine.id} value={mineStyle} onPick={recolour} choice={choice} label={`Colours of ${mine.name}`} />
              </div>
            )}
            <div className="rp-website-actions">
              <PrimaryButton onClick={() => onOpenStudio()}>Edit in Studio</PrimaryButton>
              {mine.id && <SecondaryButton onClick={() => setPreview({ id: mine.id!, style: mineStyle })}>Preview</SecondaryButton>}
            </div>
          </div>
        </div>
      </section>

      <section className="rp-cardbox" aria-labelledby="website-change" data-testid="change-website">
        <div className="rp-website-change-head">
          <div>
            <h2 id="website-change" className="rp-cardbox-title">Change your website</h2>
            <p className="rp-hint">Each comes with its own layout and pages, shown here for {KIND_WORDS[kind].toLowerCase()}. Your products, words, logo and pages stay, and nothing changes for shoppers until you publish.</p>
          </div>
        </div>
        <ul className="rp-website-grid">
          {others.map((id) => {
            const theme = starterTheme(id, null);
            if (!theme) return null;
            const style = picked[id] ?? coloursOf(id, choice)[0]?.id ?? null;
            return (
              <li key={id} className="rp-website-card">
                <button type="button" className="rp-website-card-shot" onClick={() => setPreview({ id, style })} aria-label={`Preview ${theme.name}`}>
                  <Shot id={id} style={style} name={theme.name} />
                </button>
                <div className="rp-website-card-words">
                  <div className="rp-website-card-title">
                    <strong>{theme.name}</strong>
                    {fresh.includes(id) && <StatusBadge tone="info" glyph={false}>New</StatusBadge>}
                  </div>
                  <p className="rp-hint">{STARTER_BLURB[id]}</p>
                  <Colours id={id} value={style} onPick={(s) => setPicked((p) => ({ ...p, [id]: s }))} choice={choice} label={`Colours of ${theme.name}`} />
                  <div className="rp-website-actions">
                    <PrimaryButton size="sm" onClick={() => use(id, style)} disabled={!!busy}>{busy === id ? "Putting it in your draft…" : "Use this"}</PrimaryButton>
                    <SecondaryButton size="sm" onClick={() => setPreview({ id, style })}>Preview</SecondaryButton>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {savedCount > 0 && (
          <p className="rp-hint rp-website-saved">
            You have {savedCount} saved design{savedCount === 1 ? "" : "s"}. <button type="button" className="rp-link" onClick={() => setSavedOpen(true)}>Bring one back</button>
          </p>
        )}
      </section>

      <Dialog open={savedOpen} onClose={() => setSavedOpen(false)} title="Your saved designs"
        description="Designs you saved before. Use this puts one in your draft, and you can switch back for 30 days.">
        {savedOpen && !savedCount && <p className="rp-hint">No saved designs left.</p>}
        {savedOpen && savedCount > 0 && <ul className="rp-listcard" data-testid="saved-designs">
          {saved.map((t) => (
            <li key={t.id}>
              <span className="rp-listcard-main"><span className="rp-listcard-name">{t.name}</span>
                <span className="rp-hint">Saved {new Date(t.savedAt).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}</span></span>
              <span className="rp-website-actions">
                <SecondaryButton size="sm" onClick={() => remove(t)} disabled={!!busy}>{busy === `remove:${t.id}` ? "Removing…" : removing === t.id ? "Remove for good" : "Remove"}</SecondaryButton>
                <PrimaryButton size="sm" onClick={() => bringBack(t)} disabled={!!busy}>{busy === `saved:${t.id}` ? "Putting it in your draft…" : "Use this"}</PrimaryButton>
              </span>
            </li>
          ))}
        </ul>}
      </Dialog>

      {preview && (
        <Suspense fallback={<div className="rp rp-starter-preview" role="status"><p className="rp-starter-preview-loading">Opening the preview…</p></div>}>
          <StarterPreview id={preview.id} style={preview.style} showAs={showAs} settings={settings} sells={sells} choice={choice}
            current={preview.id === mine.id} onUse={(style, as) => use(preview.id, style, as)} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </>
  );
}
