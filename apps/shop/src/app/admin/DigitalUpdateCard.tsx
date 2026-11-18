// Books › edit › Tell buyers about a new version (Digital D2b, Beta): after the owner replaces a download with a new
// version and saves, one button emails everyone who bought it their links again, with an optional note. The server sends
// it a page at a time (functions/digitalUpdates.js); this card only asks and shows where it is.
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Dialog, GhostButton, PrimaryButton, SecondaryButton, SectionCard, TextArea } from "./riso/components";
import { adminApi } from "./api";
import { hasNewVersion, jobActive, jobLine, type DigitalUpdateJob } from "./digitalUpdate";

export function DigitalUpdateCard({ bookId, form, unsaved }: { bookId?: string; form: any; unsaved: boolean }) {
  const [buyers, setBuyers] = useState<number | null>(null);
  const [latest, setLatest] = useState<DigitalUpdateJob | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!bookId) return () => {};
    let live = true;
    adminApi.digitalUpdate("status", bookId).then(
      (r) => { if (!live) return; setBuyers(r.buyers ?? 0); setLatest(r.latest ?? null); setFailed(false); },
      () => { if (live) setFailed(true); });
    return () => { live = false; };
  };
  useEffect(load, [bookId]);
  // While a send is going, look again every 20 seconds so the count moves.
  useEffect(() => {
    if (!jobActive(latest)) return;
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [latest?.status, bookId]);

  if (!bookId) return null;
  const changed = hasNewVersion(form);

  const send = async () => {
    setBusy(true);
    try {
      const r = await adminApi.digitalUpdate("send", bookId, { note });
      setLatest(r.latest ?? null);
      setOpen(false);
      setNote("");
      toast.success("Buyers will be told within 15 minutes");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stop = async (op: "cancel" | "resume") => {
    try { await adminApi.digitalUpdate(op, bookId); load(); } catch (err) { toast.error((err as Error).message); }
  };

  return (
    <SectionCard title="Tell buyers about a new version (Beta)" description="Emails everyone who bought this their download links again.">
      <p className="be-note" data-testid="digital-update-line">
        {failed ? "Couldn't check who bought this." : buyers === null ? "Checking…" : jobLine(latest) || (buyers ? `${buyers} ${buyers === 1 ? "buyer" : "buyers"} so far.` : "Nobody has bought this yet.")}
      </p>
      <div className="be-inline-actions">
        <PrimaryButton size="sm" disabled={!buyers || unsaved || jobActive(latest)} onClick={() => setOpen(true)}>Tell buyers</PrimaryButton>
        {jobActive(latest) && <GhostButton size="sm" onClick={() => void stop("cancel")}>Stop</GhostButton>}
        {latest?.status === "paused" && <SecondaryButton size="sm" onClick={() => void stop("resume")}>Carry on</SecondaryButton>}
      </div>
      {unsaved && !!buyers && <p className="rp-hint">Save first, so buyers get the new files.</p>}
      {!unsaved && !!buyers && !changed && !latest && <p className="rp-hint">Use “New version” beside a file above, save, then tell buyers.</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Tell ${buyers ?? 0} ${buyers === 1 ? "buyer" : "buyers"}?`}
        description="Each gets an email with their download links. Their earlier copy still works."
        footer={<>
          <SecondaryButton onClick={() => setOpen(false)}>Cancel</SecondaryButton>
          <PrimaryButton busy={busy} disabled={busy} onClick={() => void send()}>Send the email</PrimaryButton>
        </>}>
        <TextArea label="What changed (optional)" hint="Shown in the email, such as “Fixed two typos and added a chapter.”" rows={4} maxLength={2000}
          value={note} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    </SectionCard>
  );
}
