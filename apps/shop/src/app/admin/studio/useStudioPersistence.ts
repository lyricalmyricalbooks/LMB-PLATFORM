import { useEffect, useRef, useState } from "react";
import { auth } from "../../../lib/firebase";
import { discardDraft, publishDesign, saveDraft, studioTabId, ThemeConflictError, watchWorkspace, type RemoteWorkspace, type Workspace } from "../themeStore";
import { sameDesign } from "./studioModel";
import { designSize } from "./studioChecks";
import { friendlyError } from "./friendlyError";
import { createSnapshotWriter, decideRemoteChange, newestRecovery, parseRecovery, RECOVERY_PREFIX, resolveSaveConflict } from "./studioWorkflow";

type Kind = "draft" | "publish" | "discard";
/** Another tab or device saved first, and both changed the same settings: the owner chooses. */
export type SaveConflict = {
  kind: Kind; server: { draft: any; rev: number }; paths: string[];
  /** This tab's changes plus the other tab's, with this tab's value where both changed the same setting. */
  mine: any;
  /** The same combination, with the other tab's value where both changed the same setting. */
  theirs: any;
};
/** Studio 3.2: a save from another tab or device that meets unsaved edits here (shown as a banner). */
export type IncomingChange = { remote: RemoteWorkspace; merged: any; paths: string[] };

export function useStudioPersistence(props: {
  design: any; savedDraft: any; published: any; workspace: Workspace;
  setSavedDraft: (design: any) => void; setPublished: (design: any) => void;
  onPersisted?: (design: any, published: boolean) => void;
  reset: (design: any) => void; restore: (design: any) => void;
  /** "warn" toasts stay until dismissed; an action is a button inside the toast. */
  say: (kind: "ok" | "warn" | "err", message: string, action?: { label: string; run: () => void }) => void;
  /** Normalise a design the way Studio holds it (live sync compares like with like). */
  normalize?: (design: any) => any;
  /** Read the live design fresh (a scheduled go-live can change it behind Studio's back). Discard goes back to it. */
  readPublished?: () => Promise<any>;
}) {
  const current = useRef(props); current.current = props;
  const writer = useRef(createSnapshotWriter());
  const locked = useRef(false);
  const rev = useRef(props.workspace.rev);
  const [busy, setBusy] = useState<null | Kind>(null);
  const [conflict, setConflict] = useState<SaveConflict | null>(null);
  /** When this tab last saved, for the status pill's hover text. */
  const [lastSaved, setLastSaved] = useState<null | { at: number; kind: "draft" | "publish" }>(null);
  /** The live-updates subscription failed: other tabs' saves are no longer followed. */
  const [liveSyncPaused, setLiveSyncPaused] = useState(false);
  // One recovery record per browser tab, so two open Studio tabs never overwrite each other's.
  const prefix = `${RECOVERY_PREFIX}${import.meta.env.BASE_URL}:${auth.currentUser?.uid || "local-preview"}:`;
  const recoveryKey = prefix + studioTabId();
  const [recovery, setRecovery] = useState(() => {
    try { return newestRecovery(localStorage, prefix, props.savedDraft) ?? parseRecovery(localStorage.getItem(`studio-recovery-v1:${import.meta.env.BASE_URL}:${auth.currentUser?.uid || "local-preview"}`), props.savedDraft); }
    catch { return null; }
  });
  const warned = useRef(false);
  useEffect(() => {
    if (recovery) return;
    const store = () => {
      const p = current.current;
      try {
        if (sameDesign(p.design, p.savedDraft)) localStorage.removeItem(recoveryKey);
        else localStorage.setItem(recoveryKey, JSON.stringify({ version: 1, design: p.design, base: JSON.stringify(p.savedDraft), savedAt: Date.now() }));
      } catch {
        if (!warned.current) { warned.current = true; p.say("err", "Local recovery is unavailable. Use Save draft to keep your work."); }
      }
    };
    // Written when the browser is idle (within 1.5 s), so serialising the design never competes with typing (Phase 4).
    const idle = (window as any).requestIdleCallback as undefined | ((fn: () => void, o: { timeout: number }) => number);
    const handle = idle ? idle(store, { timeout: 1500 }) : setTimeout(store, 400);
    window.addEventListener("pagehide", store);
    return () => {
      if (idle) (window as any).cancelIdleCallback?.(handle); else clearTimeout(handle);
      window.removeEventListener("pagehide", store);
    };
  }, [props.design, props.savedDraft, recoveryKey, recovery]);

  const dismissRecovery = () => {
    try {
      if (recovery?.key) localStorage.removeItem(recovery.key);
      localStorage.removeItem(recoveryKey);
      localStorage.removeItem(`studio-recovery-v1:${import.meta.env.BASE_URL}:${auth.currentUser?.uid || "local-preview"}`);
    } catch { /* manual saving remains available */ }
    setRecovery(null);
  };
  const recover = () => {
    if (!recovery) return;
    props.restore(recovery.design); dismissRecovery();
  };

  const persist = async (kind: Kind, override?: any): Promise<void> => {
    if (locked.current) {
      current.current.say("err", kind === "publish" ? "Still saving — press Publish again in a moment."
        : kind === "discard" ? "Still saving — press Discard again in a moment." : "Still saving — try again in a moment.");
      return;
    }
    const size = designSize(override ?? (kind === "discard" ? current.current.published : current.current.design));
    if (size.tooBig) { current.current.say("err", size.text); return; }
    locked.current = true; setBusy(kind);
    const p = current.current;
    let lost: ThemeConflictError | null = null;
    try {
      // Discard goes back to what is live right now, not to what was live when Studio opened (a scheduled
      // publish or campaign may have changed it since). If the live design can't be read, nothing is discarded.
      let fresh = p.published;
      if (kind === "discard" && p.readPublished) {
        try { fresh = await p.readPublished(); p.setPublished(fresh); }
        catch { p.say("err", "Couldn't check the live design, so your draft was not discarded. Check your connection and try again."); return; }
      }
      // Designs are never mutated, so the object that was saved can stand for "saved" afterwards: later
      // comparisons then skip every part the owner hasn't touched since (Phase 4).
      const source = override ?? (kind === "discard" ? fresh : p.design);
      const snapshot = await writer.current.run(source, async captured => {
        const ws = p.workspace;
        rev.current = kind === "discard" ? await discardDraft(ws, captured, rev.current)
          : kind === "publish" ? await publishDesign(ws, captured, rev.current)
          : await saveDraft(ws, captured, rev.current);
      });
      if (!snapshot) return;
      p.setSavedDraft(source);
      if (kind === "publish") p.setPublished(source);
      if (kind === "discard") { p.reset(source); dismissRecovery(); }
      p.onPersisted?.(snapshot, kind === "publish");
      if (kind !== "discard") setLastSaved({ at: Date.now(), kind });
      p.say("ok", kind === "publish" ? "Published. Newer edits remain in your draft." : kind === "discard" ? "Draft discarded." : "Draft saved. Publish when you’re ready to go live.");
      if (kind !== "discard") {
        try { await adminApiVersion(kind, snapshot); }
        catch { p.say("err", "Your design was saved, but its history snapshot could not be saved."); }
      }
    } catch (error: any) {
      if (error instanceof ThemeConflictError) lost = error;
      else {
        // A draft save can be retried straight from the toast; Publish goes back through its review dialog.
        p.say("err", friendlyError(error, kind === "draft" ? "save the draft" : kind === "publish" ? "publish" : "discard the draft", { keepsChanges: kind !== "discard" }),
          kind === "draft" ? { label: "Try again", run: () => { void persist("draft"); } } : undefined);
      }
    } finally { locked.current = false; setBusy(null); }
    if (lost) await handleConflict(kind, lost.server);
    // A change that arrived from another tab while this one was saving is looked at now.
    if (pendingRemote.current) { const next = pendingRemote.current; pendingRemote.current = null; receive(next); }
  };

  // ── Live sync (3.2): follow saves made in other tabs and devices while Studio is open ──
  const [incoming, setIncoming] = useState<IncomingChange | null>(null);
  const pendingRemote = useRef<RemoteWorkspace | null>(null);
  const receive = (raw: RemoteWorkspace) => {
    if (locked.current) { pendingRemote.current = raw; return; }
    const p = current.current;
    const remote = { ...raw, draft: p.normalize ? p.normalize(raw.draft) : raw.draft };
    const decision = decideRemoteChange({ localRev: rev.current, remote, design: p.design, savedDraft: p.savedDraft });
    if (decision.kind === "ignore") return;
    // A Publish elsewhere is live whatever happens to the draft here.
    if (remote.published) p.setPublished(remote.draft);
    if (decision.kind === "rebase") { rev.current = remote.rev; p.setSavedDraft(remote.draft); setIncoming(null); return; }
    if (decision.kind === "adopt") {
      rev.current = remote.rev; p.setSavedDraft(remote.draft); p.restore(remote.draft); setIncoming(null);
      p.say("ok", remote.published ? "Updated: this design was published from another tab or device." : "Updated with changes saved in another tab or device.");
      return;
    }
    setIncoming({ remote, merged: decision.merged, paths: decision.kind === "conflict" ? decision.paths : [] });
  };
  const receiveRef = useRef(receive); receiveRef.current = receive;
  useEffect(() => watchWorkspace(remote => receiveRef.current(remote), error => { console.warn("[Studio] live updates paused", error); setLiveSyncPaused(true); }), []);

  /** Banner choices: combine both (keeping mine where we both changed something), take theirs, or decide later. */
  const resolveIncoming = (choice: "combine" | "theirs" | "later") => {
    const change = incoming; setIncoming(null);
    if (!change || choice === "later") return;
    const p = current.current;
    // A newer save may have arrived since the banner opened: always act on the latest decision.
    const decision = decideRemoteChange({ localRev: rev.current, remote: change.remote, design: p.design, savedDraft: p.savedDraft });
    if (decision.kind === "ignore") return;
    rev.current = change.remote.rev;
    p.setSavedDraft(change.remote.draft);
    if (choice === "theirs" || decision.kind === "adopt" || decision.kind === "rebase") {
      if (choice === "theirs") p.reset(change.remote.draft); else p.restore(change.remote.draft);
      p.say("ok", "Loaded the version saved in the other tab or device.");
      return;
    }
    p.restore(decision.merged);
    p.say("ok", decision.kind === "conflict"
      ? "Their changes are in. Where you both changed the same setting, your edit was kept — save when ready."
      : "Their changes are in, alongside your unsaved edits. Save when ready.");
  };

  // Another tab saved first. Changes to different settings are combined automatically;
  // the owner only decides when both sides changed the same setting.
  const handleConflict = async (kind: Kind, server: { draft: any; rev: number }) => {
    const p = current.current;
    if (kind === "discard") { rev.current = server.rev; return persist("discard"); }
    const { mine, theirs, conflicts } = resolveSaveConflict(p.savedDraft, p.design, server.draft);
    if (conflicts.length) { setConflict({ kind, server, paths: conflicts, mine, theirs }); return; }
    rev.current = server.rev;
    p.setSavedDraft(server.draft);
    p.restore(mine);
    // A Publish never goes out carrying the other tab's unpublished draft work: the combined design is shown
    // here, and the owner reviews it and presses Publish again.
    if (kind === "publish") {
      p.say("warn", "This design was also saved in another tab or device. Both sets of changes were combined and nothing was published. Review the result, then press Publish.");
      return;
    }
    p.say("ok", "This design was also saved in another tab or device. Both sets of changes were combined.");
    return persist(kind, mine);
  };

  const resolveConflict = (choice: "mine" | "theirs" | "cancel") => {
    const c = conflict; setConflict(null);
    if (!c || choice === "cancel") return;
    const p = current.current;
    rev.current = c.server.rev;
    p.setSavedDraft(c.server.draft);
    // Either way everything only one side changed is kept; the choice decides only the settings both changed.
    if (choice === "theirs") {
      p.restore(c.theirs);
      p.say("ok", "Took the other version of the settings you both changed. Your other edits are still here, unsaved.");
      return;
    }
    p.restore(c.mine);
    if (c.kind === "publish") {
      p.say("warn", "Kept your version of the settings you both changed, and brought in the other tab's other changes. Nothing is published yet: review the result, then press Publish.");
      return;
    }
    return persist(c.kind, c.mine);
  };

  return {
    busy, lastSaved, liveSyncPaused, recovery, recover, dismissRecovery, conflict, resolveConflict, incoming, resolveIncoming,
    saveDraft: () => persist("draft"), publish: () => persist("publish"), discard: () => persist("discard"),
  };
}

// Version history is best-effort and separate from the save itself.
async function adminApiVersion(kind: "draft" | "publish", snapshot: any) {
  const { adminApi } = await import("../api");
  await adminApi.saveThemeVersion(kind === "publish" ? "published" : "draft", `${kind === "publish" ? "Published" : "Draft"} ${new Date().toLocaleString()}`, snapshot);
}
