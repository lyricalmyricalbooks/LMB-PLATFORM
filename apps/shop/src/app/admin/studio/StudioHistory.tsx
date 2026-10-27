// Theme actions › Version history (Studio 3.1): every Publish (last 30), the latest saved draft and the owner's
// named checkpoints, which are pinned and never age out. Compare any version with the current draft, the live
// design or another version, in Studio's own words (designDiff.ts), and take back one change at a time — each
// restore is one named, undoable draft change. Nothing here publishes.
import { useMemo, useState } from "react";
import { ArrowLeft, GitCompare, Pin } from "lucide-react";
import { ActionMenu, Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { diffDesigns, groupByArea, type DiffContext, type DiffItem } from "./designDiff";

export type ThemeVersion = {
  id: string; kind: "draft" | "published" | "checkpoint"; label: string; name?: string; pinned?: boolean; createdAt: string; design: any;
};
export type HistoryActions = {
  saveCheckpoint: (name: string, design: any) => Promise<ThemeVersion>;
  update: (id: string, patch: { name?: string; pinned?: boolean }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};
type Props = {
  open: boolean;
  onClose: () => void;
  versions: ThemeVersion[];
  reload: () => Promise<void> | void;
  /** The current draft (with unsaved edits) and the live design. */
  draft: any;
  published: any;
  /** normalizeDesign with Studio's defaults, so both sides compare like for like. */
  normalize: (design: any) => any;
  ctx: DiffContext;
  previewingId: string | null;
  onPreview: (version: ThemeVersion | null) => void;
  onRestoreAll: (version: ThemeVersion) => void;
  onRestoreItem: (version: ThemeVersion, item: DiffItem) => void;
  actions: HistoryActions;
  askText: (opts: { title: string; label: string; defaultValue?: string; confirmLabel?: string }) => Promise<string | null>;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  say: (kind: "ok" | "err", text: string) => void;
};

export const versionName = (v: ThemeVersion) => v.name || v.label || "Version";
const KIND: Record<ThemeVersion["kind"], { word: string; tone: "success" | "primary" | "neutral" }> = {
  published: { word: "Published", tone: "success" },
  checkpoint: { word: "Checkpoint", tone: "primary" },
  draft: { word: "Latest saved draft", tone: "neutral" },
};
const CHANGE_WORD: Record<DiffItem["change"], string> = { changed: "Changed", added: "Added", removed: "Removed", moved: "Moved" };
type Filter = "all" | "published" | "checkpoint";
const WHEN = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : WHEN.format(d); };
const pinnedLimit = (err: unknown) => String((err as any)?.message || err).includes("THEME_PINNED_LIMIT");

export function StudioHistory(p: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [comparing, setComparing] = useState<string | null>(null);
  const [against, setAgainst] = useState<string>("draft");
  const [busy, setBusy] = useState(false);
  const version = p.versions.find(v => v.id === comparing) || null;
  const shown = p.versions.filter(v => filter === "all" || v.kind === filter || (filter === "checkpoint" && v.pinned));

  const other = against === "draft" ? p.draft : against === "live" ? p.published : p.versions.find(v => v.id === against)?.design;
  const otherName = against === "draft" ? "Your draft" : against === "live" ? "Live site" : (p.versions.find(v => v.id === against) ? versionName(p.versions.find(v => v.id === against)!) : "");
  const otherInline = against === "draft" ? "your draft" : against === "live" ? "the live site" : `“${otherName}”`;
  const items = useMemo(() => (version && other ? diffDesigns(p.normalize(version.design), p.normalize(other), p.ctx) : []),
    [version, other, p.normalize, p.ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = groupByArea(items);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); await p.reload(); p.say("ok", ok); }
    catch (err) {
      p.say("err", pinnedLimit(err) ? "You can keep up to 20 pinned versions. Unpin or delete one first." : "Couldn't update version history. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const saveCheckpoint = async () => {
    const name = await p.askText({ title: "Save checkpoint", label: "Name this checkpoint (it keeps your current draft, including unsaved edits, until you delete it)", defaultValue: `Checkpoint ${new Date().toLocaleDateString()}`, confirmLabel: "Save checkpoint" });
    if (name === null) return;
    await run(() => p.actions.saveCheckpoint(name.trim() || `Checkpoint ${new Date().toLocaleString()}`, p.draft), `Checkpoint “${name.trim() || "Checkpoint"}” saved.`);
  };
  const rename = async (v: ThemeVersion) => {
    const name = await p.askText({ title: "Rename version", label: "Name", defaultValue: versionName(v), confirmLabel: "Rename" });
    if (!name || !name.trim()) return;
    await run(() => p.actions.update(v.id, { name: name.trim() }), "Version renamed.");
  };
  const keepDraft = async (v: ThemeVersion) => {
    const name = await p.askText({ title: "Keep as checkpoint", label: "Name this checkpoint", defaultValue: `Draft ${when(v.createdAt)}`, confirmLabel: "Keep it" });
    if (name === null) return;
    await run(() => p.actions.saveCheckpoint(name.trim() || `Draft ${when(v.createdAt)}`, v.design), "Saved draft kept as a checkpoint.");
  };
  const remove = async (v: ThemeVersion) => {
    const ok = await p.askConfirm({ title: `Delete “${versionName(v)}”?`, message: "This version is removed from history for good. Your draft and the live site don't change.", confirmLabel: "Delete version" });
    if (!ok) return;
    if (comparing === v.id) setComparing(null);
    if (p.previewingId === v.id) p.onPreview(null);
    await run(() => p.actions.remove(v.id), "Version deleted.");
  };
  const close = () => { setComparing(null); p.onClose(); };

  return (
    <Dialog open={p.open} onClose={close} size="lg" title={version ? `Compare “${versionName(version)}”` : "Version history"}
      description={version ? "Each line is something that differs. Previewing never changes your draft."
        : "Each Publish is kept (the last 30), plus your latest saved draft and any checkpoints you pin. Previewing never changes your draft."}>
      <div className="studio-history" data-studio-panel="history">
        {!version && <>
          <div className="studio-history-bar">
            <PrimaryButton size="sm" disabled={busy} onClick={saveCheckpoint}>Save checkpoint…</PrimaryButton>
            <div className="studio-history-filter" role="group" aria-label="Show">
              {(["all", "published", "checkpoint"] as Filter[]).map(f => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "published" ? "Published" : "Checkpoints"}</button>
              ))}
            </div>
          </div>
          {!shown.length && <p className="studio-empty">{filter === "checkpoint" ? "No checkpoints yet. Save one before a big change, so you can always go back." : "No saved versions yet."}</p>}
          <ul className="studio-history-list">
            {shown.map(v => (
              <li key={v.id} className={`studio-history-row${p.previewingId === v.id ? " is-previewing" : ""}`} data-version-id={v.id}>
                <div className="studio-history-name">
                  <strong>{v.pinned && <Pin size={12} aria-label="Pinned" />} {versionName(v)}</strong>
                  <span><StatusBadge tone={KIND[v.kind]?.tone || "neutral"}>{KIND[v.kind]?.word || v.kind}</StatusBadge> {when(v.createdAt)}</span>
                </div>
                <div className="studio-history-actions">
                  <SecondaryButton size="sm" onClick={() => { setComparing(v.id); setAgainst("draft"); }}><GitCompare size={13} aria-hidden /> Compare</SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => p.onPreview(p.previewingId === v.id ? null : v)}>{p.previewingId === v.id ? "Stop preview" : "Preview"}</SecondaryButton>
                  <SecondaryButton size="sm" onClick={() => p.onRestoreAll(v)}>Restore all to draft</SecondaryButton>
                  <ActionMenu label={`More actions for ${versionName(v)}`} actions={[
                    ...(v.kind === "draft" ? [{ label: "Keep as checkpoint", onSelect: () => void keepDraft(v) }] : [
                      { label: "Rename", onSelect: () => void rename(v) },
                      { label: v.pinned ? "Unpin" : "Pin (keep for good)", onSelect: () => void run(() => p.actions.update(v.id, { pinned: !v.pinned }), v.pinned ? "Unpinned: it will age out with older versions." : "Pinned: it stays in history until you unpin it.") },
                      { label: "Delete", tone: "danger" as const, onSelect: () => void remove(v) },
                    ]),
                  ]} />
                </div>
              </li>
            ))}
          </ul>
          {p.previewingId && <p className="studio-history-note" role="status">Previewing “{versionName(p.versions.find(v => v.id === p.previewingId) || { label: "a version" } as any)}”. Stop the preview or close History to see your draft again.</p>}
        </>}
        {version && <>
          <div className="studio-history-bar">
            <SecondaryButton size="sm" onClick={() => setComparing(null)}><ArrowLeft size={13} aria-hidden /> All versions</SecondaryButton>
            <label className="studio-history-against">Compare with
              <select value={against} onChange={e => setAgainst(e.target.value)}>
                <option value="draft">Your current draft</option>
                <option value="live">The live site</option>
                {p.versions.filter(v => v.id !== version.id).map(v => <option key={v.id} value={v.id}>{versionName(v)}</option>)}
              </select>
            </label>
          </div>
          {!items.length && <p className="studio-empty">No differences: {otherInline} matches this version.</p>}
          {groups.map(g => (
            <section key={g.area} className="studio-history-group">
              <h3>{g.area}</h3>
              <ul>
                {g.items.map(item => (
                  <li key={item.id} className="studio-history-item" data-diff-id={item.id}>
                    <div>
                      <strong>{item.label}</strong> <span className="studio-history-change">{CHANGE_WORD[item.change]}</span>
                      {(item.before !== undefined || item.after !== undefined) && (
                        <small className="studio-history-values">
                          {item.change === "changed" && item.after === undefined
                            ? <>Fields: {item.before}</>
                            : <>
                              <span>{versionName(version)}: {item.color && item.before && <i className="studio-history-swatch" style={{ background: item.before }} />}{item.before}</span>
                              <span aria-hidden> → </span>
                              <span>{otherName}: {item.color && item.after && <i className="studio-history-swatch" style={{ background: item.after }} />}{item.after}</span>
                            </>}
                        </small>
                      )}
                      {item.change === "added" && <small className="studio-history-values">Only in {otherInline}</small>}
                      {item.change === "removed" && <small className="studio-history-values">Only in “{versionName(version)}”</small>}
                    </div>
                    {against === "draft" && (
                      <SecondaryButton size="sm" onClick={() => p.onRestoreItem(version, item)}>Use this version's</SecondaryButton>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {against !== "draft" && items.length > 0 && <p className="studio-history-note">To take a change back into your draft, compare with <strong>Your current draft</strong>.</p>}
        </>}
      </div>
    </Dialog>
  );
}
