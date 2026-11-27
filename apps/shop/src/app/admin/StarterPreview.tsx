// Online store › Preview (one website picker): a starter as the real shop draws it, full screen, with its sample products
// and photos, in any of its colours and shown as a products, services or both shop. The shop's own storefront runs in the
// frame and is handed the starter the way Studio hands it a draft (buildPreviewState), so nothing is saved or published.
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, X } from "lucide-react";
import { IconButton, PrimaryButton, SecondaryButton } from "./riso/components";
import { applyStarter, starterForShop, type LeadSide, type StarterKind } from "./studio/starterDesign";
import { starterSampleBooks } from "./studio/presetContent";
import { sampleShopBooks } from "../../designFirst/beforeShop";
import { starterPhotos } from "./studio/starterPhotos";
import { buildPreviewState, deliverPreviewState } from "./studio/studioWorkflow";
import { sampleShipping, starterBookingSamples, starterSamplePages, starterShelves } from "./studio/starterWalkthrough";
import { styledName } from "./studio/starterStyles";
import { withStarterWords } from "./sells";
import { wordsFor } from "../../shared/shopSells";
import { getSectionMeta } from "./ThemeEditorExtensions";
import { coloursOf, KIND_WORDS, starterTheme, type ShowAs } from "./websiteChoice";
import type { StarterChoice } from "./lookGallery";

type Props = {
  id: string;
  style: string | null;
  showAs: ShowAs;
  settings: any;
  sells?: string | null;
  choice?: StarterChoice;
  /** The starter is already the shop's website: Use this is left out. */
  current?: boolean;
  onUse?: (style: string | null, showAs: ShowAs) => void;
  onClose: () => void;
};

const KINDS: StarterKind[] = ["products", "services", "both"];

export function StarterPreview({ id, style: firstStyle, showAs: firstShowAs, settings, sells, choice, current, onUse, onClose }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [style, setStyle] = useState(firstStyle);
  const [showAs, setShowAs] = useState<ShowAs>(firstShowAs);
  const [phone, setPhone] = useState(false);
  const [ready, setReady] = useState(false);
  const theme = useMemo(() => starterTheme(id, style), [id, style]);
  const name = theme ? styledName(theme) : "";

  // The starter as a finished shop of this kind: its design with the shop's words, its sample products (none for services),
  // and, like the live demo shops, its made-up brand's name, its own pages, its shelves in the menu, its sample services and
  // team, and a sample shipping rule, so every page a shopper can reach opens (starterWalkthrough.ts).
  const state = useMemo(() => {
    if (!theme) return null;
    const w = wordsFor(sells);
    const shaped = starterForShop(theme, showAs.kind, showAs.lead);
    // A starter made for appointments has no products of its own: shown as Products or Both it borrows a general sample
    // set, as the demo's Both shops do, so its shop page and product pages open with something on them.
    const own = starterSampleBooks(theme);
    const books = showAs.kind === "services" ? [] : own.length ? own : sampleShopBooks("other");
    const brand = theme.content?.sampleBrand || settings?.info?.name || "";
    const shelves = starterShelves(books);
    const brandLine = typeof theme.global?.catalogIntro === "string" ? { footerAbout: theme.global.catalogIntro } : {};
    const applied = applyStarter(settings?.design || {}, shaped, getSectionMeta, w, starterPhotos(sells));
    // A shop that isn't open yet has its "under construction" wall on: the preview shows the website behind it.
    const design = {
      ...withStarterWords({ ...applied, copy: { ...(applied.copy || {}), ...brandLine, ...(brand ? { siteName: brand } : {}) } }, sells),
      // The menu lists the sample shelves; a shop with nothing to sell lists none (not the shop's own shelves).
      categories: shelves,
      showUnderConstruction: false,
    };
    const bookings = showAs.kind === "products" ? { starterServices: [], starterTeam: [] } : starterBookingSamples(theme);
    const takesBookings = bookings.starterServices.length > 0;
    const shown = {
      ...settings,
      ...(showAs.kind === "both" ? { sellsProducts: true } : {}),
      ...(takesBookings ? { bookingsLive: true } : {}),
      ...(brand ? { info: { ...(settings?.info || {}), name: brand } } : {}),
    };
    return { ...buildPreviewState(shown, design, starterSamplePages(shaped), books), ...bookings, shippingProfiles: sampleShipping(books) };
  }, [theme, showAs, settings, sells]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== "PREVIEW_READY") return;
      setReady(true);
      if (state) deliverPreviewState(frame.current?.contentWindow, state, window.location.origin);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state]);
  useEffect(() => { if (ready && state) deliverPreviewState(frame.current?.contentWindow, state, window.location.origin); }, [ready, state]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = `${window.location.origin}${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/?preview=true`;
  const colours = coloursOf(id, choice);
  return (
    <div className="rp rp-starter-preview" role="dialog" aria-modal="true" aria-label={`Preview of ${name}`} data-testid="starter-preview">
      <div className="rp-starter-preview-bar">
        <div className="rp-starter-preview-name">
          <strong>{name}</strong>
          <span className="rp-hint">A sample shop: its name, products, photos and pages. Yours replace them.</span>
        </div>
        <div className="rp-starter-preview-controls">
          {colours.length > 1 && (
            <div role="radiogroup" aria-label="Colours" className="rp-colour-chips">
              {colours.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={s.id === style} className="rp-colour-chip" onClick={() => setStyle(s.id)}>
                  <span aria-hidden className="rp-colour-dots">{s.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</span>{s.name}
                </button>
              ))}
            </div>
          )}
          <label className="rp-starter-preview-kind">
            <span>Show as</span>
            <select value={showAs.kind} onChange={(e) => setShowAs({ kind: e.target.value as StarterKind, lead: showAs.lead })}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_WORDS[k]}</option>)}
            </select>
          </label>
          {showAs.kind === "both" && (
            <label className="rp-starter-preview-kind">
              <span>First</span>
              <select value={showAs.lead || ""} onChange={(e) => setShowAs({ kind: "both", lead: (e.target.value || undefined) as LeadSide | undefined })}>
                <option value="">As the starter has it</option>
                <option value="products">Products</option>
                <option value="services">Services</option>
              </select>
            </label>
          )}
          <div role="group" aria-label="Screen size" className="rp-starter-preview-device">
            <IconButton label="Computer" aria-pressed={!phone} onClick={() => setPhone(false)}><Monitor size={18} aria-hidden /></IconButton>
            <IconButton label="Phone" aria-pressed={phone} onClick={() => setPhone(true)}><Smartphone size={18} aria-hidden /></IconButton>
          </div>
          {!current && onUse && <PrimaryButton onClick={() => onUse(style, showAs)}>Use this</PrimaryButton>}
          {current && <SecondaryButton onClick={onClose}>Done</SecondaryButton>}
          <IconButton label="Close preview" onClick={onClose}><X size={18} aria-hidden /></IconButton>
        </div>
      </div>
      <div className="rp-starter-preview-stage" data-device={phone ? "phone" : "computer"}>
        {!ready && <p className="rp-starter-preview-loading" role="status">Opening {name}…</p>}
        <iframe ref={frame} src={src} title={`${name} preview`} style={{ opacity: ready ? 1 : 0 }} />
      </div>
    </div>
  );
}
