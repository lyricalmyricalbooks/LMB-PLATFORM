import { EmptyState, ErrorState, LoadingState, SecondaryButton } from "../riso/components";
import { clarityIdOf, clarityUrls } from "../clarityAdmin";
import "./overviewVisitors.css";

// Overview › Traffic: Microsoft Clarity's heatmaps and recordings live on Clarity's own site (it has no reporting API
// worth drawing here), so this widget is a doorway: three links into the project, or how to connect it.

export function OverviewClarity({ settings, setActiveTab }: {
  /** The shop's settings (admin read). undefined = still loading, null = couldn't be read. */
  settings: any | null | undefined;
  setActiveTab?: (tab: string) => void;
}) {
  if (settings === undefined) return <LoadingState label="Reading settings…" />;
  if (settings === null) return <ErrorState title="Settings unavailable" description="The shop's settings couldn't be read, so the Clarity link isn't known." />;
  const id = clarityIdOf(settings);
  if (!id) {
    return <EmptyState icon="◌" title="Microsoft Clarity isn't connected" description="Add a free Clarity project in Settings › General to see where visitors click and scroll."
      action={setActiveTab ? <SecondaryButton size="sm" onClick={() => setActiveTab("general")}>Open Clarity settings</SecondaryButton> : undefined} />;
  }
  const urls = clarityUrls(id);
  const link = (href: string, label: string) => (
    <a className="rp-btn rp-btn-secondary rp-btn-sm" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
  );
  return (
    <div className="rp-vw">
      <div className="rp-vw-top">
        <p className="rp-vw-headline">Heatmaps and recordings live in Microsoft Clarity.</p>
      </div>
      <div className="rp-vw-chart">
        <p className="rp-hint" style={{ margin: "0 0 12px" }}>See where visitors click and how far they scroll on each page, and watch anonymised visits to spot where people get stuck.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {link(urls.dashboard, "Dashboard")}
          {link(urls.heatmaps, "Heatmaps")}
          {link(urls.recordings, "Recordings")}
        </div>
      </div>
      <p className="rp-vw-foot">Microsoft Clarity · project {id} · checkout, account and order tracking are never recorded</p>
    </div>
  );
}
