import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { friendlyError } from "./settingsLayout";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, Toggle } from "./riso/components";
import { backUpNow, canWrite, chooseFolder, dueForBackup, forgetFolder, readMeta, savedFolder, supported, writeMeta, type LocalMeta } from "./localBackup";
import type { TakeoutStep } from "./takeoutRun";

const when = (at: string | null) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

// Settings › General › Back up to a folder: a second copy of the shop on this computer, beside the nightly cloud backup.
export function LocalBackupCard() {
  const [meta, setMeta] = useState<LocalMeta>(readMeta);
  const [handle, setHandle] = useState<any>(null);
  const [step, setStep] = useState<TakeoutStep | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = () => setMeta(readMeta());
  useEffect(() => { void savedFolder().then((h) => { setHandle(h); setReady(true); }); }, []);

  const guard = async (work: () => Promise<void>) => {
    try { await work(); } catch (err: any) {
      if (err?.name !== "AbortError") toast.error(friendlyError(err, "back up to your folder"));
    } finally { setStep(null); refresh(); }
  };
  const run = (h: any) => guard(async () => {
    if (!(await canWrite(h, true))) { toast.error("Allow access to the folder to back up."); return; }
    setStep({ label: "Reading your shop…" });
    await backUpNow(h, setStep);
    toast.success("Backed up to your folder.");
  });
  const pick = () => guard(async () => { const h = await chooseFolder(); setHandle(h); writeMeta({ auto: true }); await run(h); });

  if (!supported()) {
    return (
      <SectionCard title="Back up to a folder" description="A second copy on your computer, besides the cloud.">
        <p className="rp-hint" style={{ margin: 0 }}>This browser can't save to a folder. Use Chrome or Edge, or Download your shop above.</p>
      </SectionCard>
    );
  }
  const busy = !!step;
  const label = step ? (step.of ? `${step.label} ${step.done}/${step.of}` : step.label) : "";
  return (
    <SectionCard title="Back up to a folder" description="A second copy on your computer, besides the cloud.">
      <p className="rp-hint" style={{ margin: "0 0 12px" }}>Your shop is already backed up in the cloud every night. This also keeps a copy on this computer.</p>
      {!ready ? null : !handle ? (
        <PrimaryButton busy={busy} onClick={() => void pick()}>{busy ? label : "Choose a folder"}</PrimaryButton>
      ) : (
        <div className="rp-stack" style={{ gap: 12 }}>
          <p style={{ margin: 0 }}>
            <strong>{handle.name}</strong>
            <span className="rp-hint">{meta.lastAt ? ` · last backup ${when(meta.lastAt)}${meta.lastSummary ? `, ${meta.lastSummary}` : ""}` : " · no backup yet"}</span>
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <PrimaryButton busy={busy} onClick={() => void run(handle)}>{busy ? label : "Back up now"}</PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => void pick()}>Change folder</SecondaryButton>
            <GhostButton disabled={busy} onClick={() => void forgetFolder().then(() => { setHandle(null); refresh(); })}>Stop</GhostButton>
          </div>
          <Toggle label="Back up once a day when I open the admin" checked={meta.auto} onChange={(v) => { writeMeta({ auto: v }); refresh(); }} />
          <p className="rp-hint" style={{ margin: 0 }}>The last 7 days are kept. If your browser asks again, press Back up now.</p>
        </div>
      )}
    </SectionCard>
  );
}

/** Runs the daily backup quietly when the admin opens, if the press turned it on and the browser still allows the folder. */
export function LocalBackupAuto() {
  useEffect(() => {
    const meta = readMeta();
    if (!supported() || !meta.auto || !dueForBackup(meta.lastAt)) return;
    let cancelled = false;
    void (async () => {
      const h = await savedFolder();
      if (!h || cancelled || !(await canWrite(h, false))) return;
      try { await backUpNow(h); toast.success("Backed up to your folder."); } catch { /* the card shows the last good backup */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
