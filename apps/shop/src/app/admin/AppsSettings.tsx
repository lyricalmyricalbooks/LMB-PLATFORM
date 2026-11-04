// Settings › Apps (platform plan 26.5): the press's apps in one place, like the big platforms' Apps page. Three tabs:
//   Installed  each app with what it can see and change, Help and Remove
//   App store  every listed app as a card, by category; Details shows the permissions before Add
//   Activity   every change an app made or was refused, with the shop's reason (appRequests, read from this shop)
// Installed and the store come through the platform's app store door (functions/appsLink.js); a shop without it shows
// only Activity. Words are lean on purpose: one line per app, details on request.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Blocks, Calculator, ExternalLink, Megaphone, MessageCircle, Package, Palette, Store, Truck, type LucideIcon } from "lucide-react";
import {
  DataTable, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, StatusBadge, Tabs, TabPanel, useConfirm, type Column,
} from "./riso/components";
import { addAddress, appsApi, type ActivityRow, type AppPermission, type AppsApi, type InstalledApp, type StoreAnswer, type StoreApp } from "./appActivity";
import { shopProfile } from "../../lib/shopProfile";
import "./apps.css";

type Tab = "installed" | "store" | "activity";
type Load<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed"; message: string; off?: boolean };

/** Each category's picture and ink, so a card reads at a glance. */
const CATEGORY_LOOK: Record<string, { icon: LucideIcon; ink: "a" | "b" | "c" | "d" }> = {
  "orders-shipping": { icon: Truck, ink: "a" },
  marketing: { icon: Megaphone, ink: "b" },
  "customer-service": { icon: MessageCircle, ink: "d" },
  accounting: { icon: Calculator, ink: "c" },
  products: { icon: Package, ink: "a" },
  website: { icon: Palette, ink: "b" },
  "in-person": { icon: Store, ink: "d" },
};

export function AppTile({ category, size = 44 }: { category: string; size?: number }) {
  const look = CATEGORY_LOOK[category] ?? { icon: Blocks, ink: "c" as const };
  const Icon = look.icon;
  return <span className="ap-tile" data-ink={look.ink} style={{ width: size, height: size }} aria-hidden="true"><Icon size={Math.round(size * 0.48)} /></span>;
}

/** The permissions in a few words each: "See" or "Change", and a tag on the ones with customers' personal details. */
function PermissionList({ permissions }: { permissions: AppPermission[] }) {
  return (
    <ul className="ap-perms">
      {permissions.map((p) => (
        <li key={p.scope} data-change={p.scope.startsWith("write_") || undefined}>
          <span>{p.words}</span>
          {p.personal && <StatusBadge tone="warning" glyph={false}>Personal details</StatusBadge>}
        </li>
      ))}
    </ul>
  );
}

/** A permission in two words for an installed app's row: "Changes orders", "Sees customers". */
const SHORT: Record<string, string> = { shop: "shop details", products: "products", inventory: "stock", orders: "orders", customers: "customers", discounts: "discounts", content: "pages" };
export const shortPermission = (scope: string) => `${scope.startsWith("write_") ? "Changes" : "Sees"} ${SHORT[scope.replace(/^(read|write)_/, "")] ?? scope}`;

function PermissionChips({ permissions }: { permissions: AppPermission[] }) {
  return (
    <ul className="ap-chips" aria-label="What it can do">
      {permissions.map((p) => <li key={p.scope} data-personal={p.personal || undefined} title={p.words}>{shortPermission(p.scope)}</li>)}
    </ul>
  );
}

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
};

const ACTIVITY_COLUMNS: Column<ActivityRow>[] = [
  { key: "app", header: "App", lead: true, render: (r) => r.app },
  { key: "what", header: "Change", render: (r) => (
    <span className="ap-change"><span>{r.what}</span>{r.reason && <span className="rp-hint">{r.reason}</span>}</span>
  ) },
  { key: "state", header: "Result", render: (r) => (
    r.state === "done" ? <StatusBadge tone="success">Done</StatusBadge>
      : r.state === "refused" ? <StatusBadge tone="danger">Refused</StatusBadge>
        : <StatusBadge tone="neutral">Waiting</StatusBadge>
  ) },
  { key: "when", header: "When", render: (r) => when(r.when) },
];

function useLoad<T>(get: () => Promise<T>): [Load<T>, () => void] {
  const [load, setLoad] = useState<Load<T>>({ state: "loading" });
  const run = useCallback(() => {
    setLoad({ state: "loading" });
    get().then((value) => setLoad({ state: "ready", value }))
      .catch((e: any) => setLoad({ state: "failed", message: e?.message || "Couldn't load this.", off: e?.code === "not_available" }));
  }, [get]);
  useEffect(run, [run]);
  return [load, run];
}

function Loaded<T>({ load, retry, children }: { load: Load<T>; retry: () => void; children: (value: T) => ReactNode }) {
  if (load.state === "loading") return <p className="rp-hint" role="status">Loading…</p>;
  if (load.state === "failed") {
    return load.off
      ? <EmptyState inline title="The app store opens soon" />
      : <EmptyState inline title="Couldn't load this" description={load.message} action={<SecondaryButton size="sm" onClick={retry}>Try again</SecondaryButton>} />;
  }
  return <>{children(load.value)}</>;
}

export function AppsSettings({ api = appsApi, shopId = shopProfile.shopId }: { api?: Pick<AppsApi, "installed" | "store" | "remove" | "activity">; shopId?: string }) {
  const [tab, setTab] = useState<Tab>("installed");
  const [installed, reloadInstalled] = useLoad(api.installed);
  const [store, reloadStore] = useLoad(api.store);
  const [activity, reloadActivity] = useLoad(api.activity);
  const [details, setDetails] = useState<StoreApp | null>(null);
  const [category, setCategory] = useState("all");
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const installedIds = useMemo(() => new Set(installed.state === "ready" ? installed.value.map((a) => a.appId) : []), [installed]);
  const count = installed.state === "ready" && installed.value.length ? installed.value.length : undefined;

  const remove = async (app: InstalledApp) => {
    const yes = await confirm({ title: `Remove ${app.name}?`, message: "It stops working in your shop at once. You can add it again later.", confirmLabel: "Remove" });
    if (!yes) return;
    setRemoving(app.appId);
    setNotice("");
    try {
      await api.remove(app.appId);
      setNotice(`${app.name} was removed.`);
      reloadInstalled();
    } catch (e: any) {
      setNotice(e?.message || "Couldn't remove it. Try again.");
    } finally {
      setRemoving(null);
    }
  };

  const addButton = (app: StoreApp, size: "sm" | "md" = "sm") => installedIds.has(app.appId)
    ? <StatusBadge tone="success">Installed</StatusBadge>
    : (
      <PrimaryButton size={size} onClick={() => window.open(addAddress(app, shopId), "_blank", "noopener")} icon={<ExternalLink size={14} aria-hidden />}>
        Add
      </PrimaryButton>
    );

  return (
    <div className="ap">
      <Tabs variant="page" label="Apps" value={tab} onChange={(t) => { setTab(t); if (t === "activity") reloadActivity(); }}
        tabs={[{ id: "installed", label: "Installed", count }, { id: "store", label: "App store" }, { id: "activity", label: "Activity" }]} />
      {notice && <p className="ap-notice" role="status">{notice}</p>}

      <TabPanel tabId="installed" active={tab === "installed"}>
        <Loaded load={installed} retry={reloadInstalled}>
          {(apps) => apps.length === 0
            ? (
              <div className="ap-empty">
                <EmptyState icon={<Blocks size={22} aria-hidden />} title="No apps yet" description="Apps add shipping, email and more to your shop."
                  action={<PrimaryButton onClick={() => setTab("store")}>Browse the app store</PrimaryButton>} />
              </div>
            )
            : (
              <ul className="ap-list">
                {apps.map((app) => (
                  <li key={app.appId} className="rp-card ap-row">
                    <AppTile category={app.category} />
                    <div className="ap-row-main">
                      <p className="ap-name">{app.name}{app.testing && <StatusBadge tone="info" glyph={false}>Testing</StatusBadge>}</p>
                      {app.tagline && <p className="ap-tagline">{app.tagline}</p>}
                      <PermissionChips permissions={app.permissions} />
                    </div>
                    <div className="ap-row-actions">
                      {app.supportEmail && <a className="rp-btn rp-btn-ghost rp-btn-sm" href={`mailto:${app.supportEmail}`}>Help</a>}
                      <GhostButton size="sm" busy={removing === app.appId} onClick={() => remove(app)}>Remove</GhostButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </Loaded>
      </TabPanel>

      <TabPanel tabId="store" active={tab === "store"}>
        <Loaded load={store} retry={reloadStore}>
          {({ apps, categories }: StoreAnswer) => {
            const used = categories.filter((c) => apps.some((a) => a.category === c.id));
            const shown = category === "all" ? apps : apps.filter((a) => a.category === category);
            if (apps.length === 0) return <EmptyState inline title="No apps on the store yet" />;
            return (
              <div className="ap-store">
                {used.length > 1 && (
                  <Tabs label="Category" value={category} onChange={setCategory} tabs={[{ id: "all", label: "All" }, ...used.map((c) => ({ id: c.id, label: c.name }))]} />
                )}
                <ul className="ap-grid">
                  {shown.map((app) => (
                    <li key={app.appId} className="rp-card ap-card">
                      <div className="ap-card-head">
                        <AppTile category={app.category} />
                        <div className="ap-card-title">
                          <p className="ap-name">{app.name}</p>
                          <p className="ap-category">{app.categoryName}</p>
                        </div>
                      </div>
                      <p className="ap-tagline">{app.tagline}</p>
                      <div className="ap-card-foot">
                        <SecondaryButton size="sm" onClick={() => setDetails(app)}>Details</SecondaryButton>
                        {addButton(app)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          }}
        </Loaded>
      </TabPanel>

      <TabPanel tabId="activity" active={tab === "activity"}>
        <Loaded load={activity} retry={reloadActivity}>
          {(rows) => (
            <DataTable caption="App activity" rowKey={(r) => r.id} rows={rows} columns={ACTIVITY_COLUMNS} stackOnPhone
              empty={<EmptyState inline title="No app activity yet" description="Changes your apps make show here." />} />
          )}
        </Loaded>
      </TabPanel>

      <Dialog open={!!details} onClose={() => setDetails(null)} title={details?.name ?? ""} description={details?.categoryName}
        footer={details ? <>{details.website && <a className="rp-btn rp-btn-ghost" href={details.website} target="_blank" rel="noopener noreferrer">Website</a>}{addButton(details, "md")}</> : null}>
        {details && (
          <div className="ap-details">
            {details.tagline && <p className="ap-lead">{details.tagline}</p>}
            {details.description && <p className="ap-description">{details.description}</p>}
            <h3 className="ap-subtitle">It can</h3>
            <PermissionList permissions={details.permissions} />
            {details.supportEmail && <p className="rp-hint">Help: <a href={`mailto:${details.supportEmail}`}>{details.supportEmail}</a></p>}
          </div>
        )}
      </Dialog>
      {confirmDialog}
    </div>
  );
}
