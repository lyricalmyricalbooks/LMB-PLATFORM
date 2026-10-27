// Studio › Themes (3.4): one place for whole designs — the live theme, your draft, My themes (saved complete designs)
// and the ready-made looks — each with a drawn thumbnail. Preview shows a theme in the canvas without touching the
// draft; Customize loads it into the draft (undoable); Publish… loads it and opens the usual Publish confirmation.
// Share a preview link saves a design behind a private, expiring link (previewTokens, firestore.rules) so someone
// can see it on the real shop before it goes live.
import { useEffect, useState } from "react";
import { Copy, Eye, Link2, Upload } from "lucide-react";
import { ActionMenu, Dialog, PrimaryButton, SecondaryButton, StatusBadge } from "../riso/components";
import { withRisoNoirDefault } from "../../features/site/risoNoir";
import type { SavedTheme } from "./savedThemes";

export type PreviewLink = { token: string; name: string; createdAt: string; expiresAt: string };
export type PreviewLinkApi = {
  create: (design: any, name: string, days: number) => Promise<PreviewLink>;
  list: () => Promise<PreviewLink[]>;
  revoke: (token: string) => Promise<void>;
};

/** A small drawing of a design: page colour, a heading in its font, an accent button and two cards. */
export function ThemeThumb({ design, label }: { design: any; label: string }) {
  const d = withRisoNoirDefault(design || {}) || {};
  const bg = d.backgroundColor || "#000000", fg = d.textColor || "#ffffff", accent = d.primaryColor || "#e8402a";
  const surface = d.surfaceColor || bg, border = d.borderColor || fg;
  const font = (f: any) => (typeof f === "string" && f ? `"${f}", system-ui, sans-serif` : "system-ui, sans-serif");
  return (
    <div className="studio-theme-thumb" role="img" aria-label={`${label}: page ${bg}, text ${fg}, accent ${accent}`} style={{ background: bg, color: fg }}>
      <span style={{ fontFamily: font(d.headingFont), textTransform: d.risoUppercaseHeadings ? "uppercase" : undefined }}>Aa</span>
      <span className="studio-theme-thumb-body" style={{ fontFamily: font(d.bodyFont) }}>Books &amp; prints</span>
      <i style={{ background: accent }} />
      <b style={{ background: surface, borderColor: border }} /><b style={{ background: surface, borderColor: border }} />
    </div>
  );
}

type Props = {
  design: any;
  published: any;
  unpublished: boolean;
  savedThemes: SavedTheme[];
  presets: { id: string; name: string; mood?: string; global?: any }[];
  currentPresetId?: string;
  previewingId: string | null;
  onPreview: (entry: { id: string; label: string; design: any } | null) => void;
  onSaveCurrent: () => void;
  onImport: (file: File) => void;
  onLoad: (t: SavedTheme) => void;
  onPublish: (t: SavedTheme) => void;
  onRename: (t: SavedTheme) => void;
  onDuplicate: (t: SavedTheme) => void;
  onDownload: (t: SavedTheme) => void;
  onDelete: (t: SavedTheme) => void;
  onSchedule?: (t: SavedTheme) => void;
  onApplyPreset: (preset: any) => void;
  links: PreviewLinkApi;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  say: (kind: "ok" | "err", text: string) => void;
};

const DAY_CHOICES = [1, 7, 30];
export const previewLinkUrl = (token: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL}?themePreview=${encodeURIComponent(token)}`;
const denied = (err: any) => err?.code === "permission-denied" || /insufficient permissions/i.test(String(err?.message || err));
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(); };

export function StudioThemes(p: Props) {
  const [share, setShare] = useState<{ name: string; design: any } | null>(null);
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<PreviewLink | null>(null);
  const [links, setLinks] = useState<PreviewLink[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // The list couldn't be read (not a rules problem): say so with Retry instead of showing no links.
  const [linksFailed, setLinksFailed] = useState(false);

  const loadLinks = async () => {
    try { setLinks(await p.links.list()); setUnavailable(false); setLinksFailed(false); }
    catch (err) { setLinks([]); if (denied(err)) setUnavailable(true); else setLinksFailed(true); }
  };
  useEffect(() => { if (share) { setCreated(null); void loadLinks(); } }, [share]); // eslint-disable-line react-hooks/exhaustive-deps

  const createLink = async () => {
    if (!share) return;
    setBusy(true);
    try { const link = await p.links.create(share.design, share.name, days); setCreated(link); void loadLinks(); }
    catch (err) {
      if (denied(err)) setUnavailable(true);
      else p.say("err", "Couldn't create the preview link. Check your connection and try again.");
    } finally { setBusy(false); }
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); p.say("ok", "Preview link copied."); }
    catch { p.say("err", "Couldn't copy automatically — select the link and copy it."); }
  };
  const revoke = async (link: PreviewLink) => {
    const ok = await p.askConfirm({ title: "Turn off this preview link?", message: `Anyone with the link to “${link.name}” will see the live shop instead.`, confirmLabel: "Turn off link" });
    if (!ok) return;
    try { await p.links.revoke(link.token); if (created?.token === link.token) setCreated(null); await loadLinks(); p.say("ok", "Preview link turned off."); }
    catch { p.say("err", "Couldn't turn off the link. Try again."); }
  };

  const previewButton = (id: string, label: string, design: any) => (
    <SecondaryButton size="sm" aria-pressed={p.previewingId === id} onClick={() => p.onPreview(p.previewingId === id ? null : { id, label, design })}>
      <Eye size={13} aria-hidden /> {p.previewingId === id ? "Stop preview" : "Preview"}
    </SecondaryButton>
  );

  return (
    <div className="studio-themes" data-studio-panel="themes">
      <section className="studio-themes-current">
        <h3>Live now</h3>
        <article className="studio-theme-card" data-theme-card="live">
          <ThemeThumb design={p.published} label="Live theme" />
          <div>
            <strong>Live theme</strong>
            <small>{p.unpublished ? "Your draft has changes that aren't live yet." : "Your draft matches the live shop."}</small>
            <div className="studio-theme-actions">
              {previewButton("live", "Live theme", p.published)}
            </div>
          </div>
        </article>
        <article className="studio-theme-card" data-theme-card="draft">
          <ThemeThumb design={p.design} label="Your draft" />
          <div>
            <strong>Your draft</strong> {p.unpublished && <StatusBadge tone="warning">Not published</StatusBadge>}
            <small>What you're editing now, including unsaved changes.</small>
            <div className="studio-theme-actions">
              <SecondaryButton size="sm" onClick={() => setShare({ name: "Draft", design: p.design })}><Link2 size={13} aria-hidden /> Share a preview link</SecondaryButton>
              <SecondaryButton size="sm" onClick={p.onSaveCurrent}>Save as a theme…</SecondaryButton>
            </div>
          </div>
        </article>
      </section>

      <section>
        <div className="studio-themes-head">
          <h3>My themes</h3>
          <label className="studio-themes-import">
            <Upload size={13} aria-hidden /> Import a theme file…
            <input type="file" accept="application/json,.json" className="sr-only" aria-label="Import a theme file"
              onChange={e => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = ""; }} />
          </label>
        </div>
        {!p.savedThemes.length && <p className="studio-empty">No saved themes yet. Save your draft as a theme to keep a copy you can switch back to.</p>}
        <div className="studio-theme-grid">
          {p.savedThemes.map(t => (
            <article key={t.id} className="studio-theme-card" data-theme-card={t.id}>
              <ThemeThumb design={t.design} label={t.name} />
              <div>
                <strong>{t.name}</strong>
                <small>Saved {when(t.savedAt)}</small>
                <div className="studio-theme-actions">
                  <PrimaryButton size="sm" onClick={() => p.onLoad(t)}>Customize</PrimaryButton>
                  {previewButton(`saved:${t.id}`, t.name, t.design)}
                  <ActionMenu label={`More actions for ${t.name}`} actions={[
                    { label: "Share a preview link", onSelect: () => setShare({ name: t.name, design: t.design }) },
                    { label: "Publish…", onSelect: () => p.onPublish(t) },
                    ...(p.onSchedule ? [{ label: "Schedule…", onSelect: () => p.onSchedule!(t) }] : []),
                    { label: "Rename", onSelect: () => p.onRename(t) },
                    { label: "Duplicate", onSelect: () => p.onDuplicate(t) },
                    { label: "Download as a file", onSelect: () => p.onDownload(t) },
                    { label: "Delete", tone: "danger", onSelect: () => p.onDelete(t) },
                  ]} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3>Start from a ready-made look</h3>
        <p className="studio-hint">A look sets colours, fonts and print details; your sections, words and menus stay.</p>
        <div className="studio-theme-grid">
          {p.presets.map(preset => {
            const look = { ...p.design, ...(preset.global || {}) };
            return (
              <article key={preset.id} className="studio-theme-card" data-theme-card={`preset:${preset.id}`}>
                <ThemeThumb design={look} label={preset.name} />
                <div>
                  <strong>{preset.name}</strong> {p.currentPresetId === preset.id && <StatusBadge tone="success">Current</StatusBadge>}
                  {preset.mood && <small>{preset.mood}</small>}
                  <div className="studio-theme-actions">
                    <PrimaryButton size="sm" onClick={() => p.onApplyPreset(preset)}>Use this look</PrimaryButton>
                    {previewButton(`preset:${preset.id}`, preset.name, look)}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <Dialog open={!!share} onClose={() => setShare(null)} title={`Share a preview of “${share?.name || ""}”`}
        description="Anyone with the link sees your shop with this design until the link expires. It isn't published, search engines skip it, and visits aren't counted.">
        <div className="studio-share">
          {unavailable ? (
            <p className="studio-share-note" role="status">Preview links need the updated Firestore rules (<code>previewTokens</code>). Deploy <code>firestore.rules</code>, then try again.</p>
          ) : <>
            <label className="studio-scheme-field">Link works for
              <select value={days} onChange={e => setDays(Number(e.target.value))}>
                {DAY_CHOICES.map(n => <option key={n} value={n}>{n === 1 ? "1 day" : `${n} days`}</option>)}
              </select>
            </label>
            <PrimaryButton size="sm" disabled={busy} onClick={createLink}>{busy ? "Creating…" : "Create link"}</PrimaryButton>
            <p className="studio-hint">The link saves a copy of the design as it is now. Later edits aren't included — create a new link to share them.</p>
            {created && (
              <div className="studio-share-created" data-share-link>
                <input readOnly value={previewLinkUrl(created.token)} aria-label="Preview link" onFocus={e => e.currentTarget.select()} />
                <SecondaryButton size="sm" onClick={() => copy(previewLinkUrl(created.token))}><Copy size={13} aria-hidden /> Copy</SecondaryButton>
                <small>Works until {new Date(created.expiresAt).toLocaleString()}.</small>
              </div>
            )}
          </>}
          {linksFailed && !unavailable && <p className="studio-share-note" role="alert">Couldn't load your preview links. <SecondaryButton size="sm" onClick={() => void loadLinks()}>Retry</SecondaryButton></p>}
          {links && links.length > 0 && <>
            <h3>Your preview links</h3>
            <ul className="studio-share-list">
              {links.map(link => {
                const expired = Date.parse(link.expiresAt) <= Date.now();
                return (
                  <li key={link.token} data-preview-link={link.token}>
                    <span><strong>{link.name}</strong> <small>{expired ? "Expired" : `until ${new Date(link.expiresAt).toLocaleDateString()}`}</small></span>
                    {!expired && <SecondaryButton size="sm" onClick={() => copy(previewLinkUrl(link.token))}>Copy</SecondaryButton>}
                    <SecondaryButton size="sm" onClick={() => revoke(link)}>{expired ? "Remove" : "Turn off"}</SecondaryButton>
                  </li>
                );
              })}
            </ul>
          </>}
        </div>
      </Dialog>
    </div>
  );
}
