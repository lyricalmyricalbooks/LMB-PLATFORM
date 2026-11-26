// Studio › ⋯ › Share a preview link (one website picker plan, step 3, 26 November 2026; was in Studio › Designs): saves the
// draft behind a private, expiring link (previewTokens, firestore.rules) so someone can see it on the real shop before it
// goes live.
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { Dialog, PrimaryButton, SecondaryButton } from "../riso/components";

export type PreviewLink = { token: string; name: string; createdAt: string; expiresAt: string };
export type PreviewLinkApi = {
  create: (design: any, name: string, days: number) => Promise<PreviewLink>;
  list: () => Promise<PreviewLink[]>;
  revoke: (token: string) => Promise<void>;
};

const DAY_CHOICES = [1, 7, 30];
export const previewLinkUrl = (token: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}${import.meta.env.BASE_URL}?themePreview=${encodeURIComponent(token)}`;
const denied = (err: any) => err?.code === "permission-denied" || /insufficient permissions/i.test(String(err?.message || err));

type Props = {
  /** The design to share and its name; null keeps the dialog closed. */
  share: { name: string; design: any } | null;
  onClose: () => void;
  links: PreviewLinkApi;
  askConfirm: (opts: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  say: (kind: "ok" | "err", text: string) => void;
};

export function StudioShareLink({ share, onClose, ...p }: Props) {
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

  return (
    <Dialog open={!!share} onClose={onClose} title={`Share a preview of “${share?.name || ""}”`}
        description="Anyone with the link sees your shop with this design until the link expires. It isn't published, search engines skip it, and visits aren't counted.">
        <div className="studio-share">
          {unavailable ? (
            <p className="studio-share-note" role="status">Preview links aren't switched on for your shop yet. Try again later, or contact support.</p>
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
  );
}
