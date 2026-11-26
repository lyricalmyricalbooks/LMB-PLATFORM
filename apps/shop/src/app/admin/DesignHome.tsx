import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { openWorkspace } from "./themeStore";
import { diffDesigns, type DiffItem } from "./studio/designDiff";
import { normalizeDesign } from "./studio/studioModel";
import { liveLookName, pageRows, publishedLine, waitingWhere, type PageRow } from "./designPageWords";
import { PageActions, PrimaryButton, SecondaryButton, StatusBadge } from "./riso/components";
import { RedirectsCard } from "./RedirectsCard";
import { WebsitePicker } from "./WebsitePicker";
import { currentWebsite } from "./websiteChoice";
import type { StudioLocation } from "../lib/studioLocation";

type Props = {
  /** The shop settings the admin already holds: `design` is the live look, `designPublishedAt` when it went live. */
  settings: any;
  /** Opens Studio, at a page when one is given. */
  onOpenStudio: (at?: StudioLocation) => void;
  onViewSite: () => void;
};

// Labels for the places a change can be, so the apricot tile reads "Home page, footer" rather than code names.
const PLACES = [
  { id: "heroPage", label: "Home page" }, { id: "storefront", label: "Shop page" }, { id: "productPage", label: "Book pages" },
  { id: "collectionPage", label: "Collections" }, { id: "cartPage", label: "Bag" }, { id: "page", label: "Pages" },
];

/**
 * Design (redesign, 11 November 2026, mockup "Online store"): two tiles (the live website, what's waiting to be
 * published), the website picker (your website, its colours and the other starters, WebsitePicker.tsx) and the shop's
 * pages, with Open Studio and View site by the title. Editing happens in Studio.
 */
export function DesignHome({ settings, onOpenStudio, onViewSite }: Props) {
  const [waiting, setWaiting] = useState<DiffItem[] | null>(null);
  const [pages, setPages] = useState<PageRow[]>(() => pageRows([]));

  useEffect(() => {
    let live = true;
    // Both reads are best effort: the page still opens Studio when either fails.
    openWorkspace(settings).then((ws) => {
      if (!live) return;
      if (!ws.draft) { setWaiting([]); return; }
      const defaults = adminApi.getDefaultSettings().design;
      setWaiting(diffDesigns(normalizeDesign(settings?.design || {}, defaults), normalizeDesign(ws.draft, defaults), { templates: PLACES }));
    }).catch(() => { if (live) setWaiting(null); });
    adminApi.getPages().then((list) => { if (live) setPages(pageRows(list as any[])); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const published = publishedLine(settings?.designPublishedAt);
  // A starter is named as the picker names it; an older look keeps the name it was saved with.
  const liveSite = currentWebsite(settings?.design);
  const count = waiting?.length ?? 0;
  return (
    <div className="rp-stack" data-testid="design-home">
      <PageActions>
        <SecondaryButton onClick={onViewSite}>View site</SecondaryButton>
        <PrimaryButton onClick={() => onOpenStudio()}>Open Studio</PrimaryButton>
      </PageActions>

      <div className="rp-tiles">
        <div className="rp-tile" data-tone="mint">
          <span className="rp-tile-label">Live now</span>
          <span className="rp-tile-value">{liveSite.id ? liveSite.name : liveLookName(settings?.design)}</span>
          {published && <span className="rp-tile-sub">{published}</span>}
        </div>
        <div className="rp-tile" data-tone={count ? "apricot" : undefined} aria-busy={waiting === null || undefined}>
          <span className="rp-tile-label">Unpublished changes</span>
          <span className="rp-tile-value">{waiting === null ? "–" : count}</span>
          <span className="rp-tile-sub">{waiting === null ? "Open Studio to see them" : count ? waitingWhere(waiting) : "Everything is live"}</span>
        </div>
      </div>

      {/* One website picker (26 November 2026): the shop's website, its colours and the other starters live here. */}
      <WebsitePicker settings={settings} onOpenStudio={onOpenStudio} />

      <section className="rp-cardbox" aria-labelledby="design-pages">
        <h2 id="design-pages" className="rp-cardbox-title">Pages</h2>
        <ul className="rp-listcard">
          {pages.map((p) => (
            <li key={p.id}>
              <button type="button" className="rp-listcard-main" onClick={() => onOpenStudio({ templateId: p.studio })} aria-label={`Open ${p.name} in Studio`}>
                <span className="rp-listcard-name">{p.name}</span>
              </button>
              <StatusBadge tone={p.live ? "success" : "warning"} glyph={false}>{p.live ? "Live" : "Draft"}</StatusBadge>
            </li>
          ))}
        </ul>
      </section>

      {/* Simpler admin, change 7: old link forwarding lives with your website, not in Settings. */}
      <div id="gs-redirects"><RedirectsCard /></div>
    </div>
  );
}
