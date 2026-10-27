import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { clarityApi, clarityUrls, cleanClarityId } from "./clarityAdmin";
import { HowTo, friendlyError } from "./settingsLayout";
import { PrimaryButton, SectionCard, StatusBadge, TextField } from "./riso/components";

// Settings › General › Microsoft Clarity. The project ID turns on Clarity's heatmaps and session recordings for
// shoppers (same rule as Google Analytics, never on checkout, account or order tracking: lib/clarity.ts).
export function ClarityCard() {
  const [loaded, setLoaded] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setReadFailed(false);
    clarityApi.load().then((id) => { setLoaded(id); setProjectId(id); }).catch(() => setReadFailed(true));
  };
  useEffect(load, []);

  const problem = projectId.trim() && !cleanClarityId(projectId)
    ? "Letters and digits only, about 10 characters." : "";
  const dirty = loaded !== null && cleanClarityId(projectId) !== loaded;

  const save = async () => {
    setSaving(true);
    try {
      await clarityApi.save(projectId);
      const next = cleanClarityId(projectId);
      setLoaded(next); setProjectId(next);
      toast.success(next ? "Microsoft Clarity is on" : "Microsoft Clarity is off");
    } catch (err: any) {
      toast.error(friendlyError(err, "save the Microsoft Clarity setting"));
    } finally {
      setSaving(false);
    }
  };

  const on = !!loaded;

  return (
    <SectionCard title="Microsoft Clarity"
      description="Heatmaps and replays. Checkout is never recorded."
      actions={loaded !== null && <StatusBadge tone={on ? "success" : "neutral"}>{on ? "Recording on" : "Off"}</StatusBadge>}>
      <HowTo summary="Setup steps" open={loaded === ""}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
          <li>At <a href="https://clarity.microsoft.com/" target="_blank" rel="noopener noreferrer">clarity.microsoft.com</a> sign in and choose <strong>New project</strong> (name: the shop, website: the shop's address).</li>
          <li>Skip the install step: copy the project ID from <strong>Settings › Overview</strong> (or paste the project's web address) into the box below and save. The shop adds Clarity itself.</li>
          <li>In Clarity's <strong>Settings › Masking</strong> choose <strong>Strict</strong>, so no text on the page is ever recorded, only where people click and scroll.</li>
        </ol>
      </HowTo>
      <TextField label="Clarity project ID" value={projectId} placeholder="abc12def34" autoComplete="off"
        hint="Public. Blank turns Clarity off."
        error={problem || undefined} onChange={(e) => setProjectId(e.target.value)} />
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved setting. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={load}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <PrimaryButton disabled={!dirty || !!problem || saving} onClick={save}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        {on && <a className="rp-btn rp-btn-secondary" href={clarityUrls(loaded!).dashboard} target="_blank" rel="noopener noreferrer">Open Clarity</a>}
      </div>
      {on && <p className="rp-hint" style={{ margin: "8px 0 0" }}>New visits land in about two hours.</p>}
    </SectionCard>
  );
}
