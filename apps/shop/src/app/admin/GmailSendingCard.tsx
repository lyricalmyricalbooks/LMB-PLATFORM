import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { db } from "../../lib/firebase";
import { emailFunction } from "./notificationApi";
import { plainError } from "./plainError";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm } from "./riso/components";

type Check = { ok: boolean; message: string } | null;

// Gmail app password for sending shop email. Stored in the admin-only adminSecrets/gmail doc
// (firestore.rules), never in the publicly readable settings/* docs, and never shown again here.
// `lastProblem` = Gmail refused the newest email in Recent deliveries (the backup sender was tried).
export function GmailSendingCard({ lastProblem = null }: { lastProblem?: { at?: string; error: string } | null }) {
  const [stored, setStored] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<Check>(null);
  const [confirm, confirmNode] = useConfirm();

  // A failed read is "unknown", not "not stored" (which would hide Remove and invite a needless re-entry).
  const [readFailed, setReadFailed] = useState(false);
  const loadStored = () => {
    setReadFailed(false);
    setStored(null);
    getDoc(doc(db, "adminSecrets", "gmail"))
      .then((snap) => setStored(Boolean(snap.exists() && snap.data()?.appPassword)))
      .catch(() => setReadFailed(true));
  };
  useEffect(() => { loadStored(); }, []);

  const cleaned = draft.replace(/\s+/g, "");
  const valid = /^[a-zA-Z]{16}$/.test(cleaned);

  // Signs in to Gmail without sending anything.
  const verify = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const result = await emailFunction({ action: "verifyGmail" });
      setCheck(result.ok ? { ok: true, message: "Gmail accepted the app password. Shop emails will send from lyricalmyricalbooks@gmail.com." } : { ok: false, message: result.error || "Gmail refused the app password." });
    } catch (err: any) {
      setCheck({ ok: false, message: plainError(err, "Couldn't check the connection") });
    } finally {
      setChecking(false);
    }
  };

  const save = async (value: string) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "adminSecrets", "gmail"), { appPassword: value, updatedAt: serverTimestamp() });
      setStored(Boolean(value));
      setDraft("");
      setCheck(null);
      toast.success(value ? "Gmail app password saved" : "Gmail app password removed");
      if (value) await verify();
    } catch (err: any) {
      toast.error(plainError(err, value ? "The app password wasn't saved" : "The app password wasn't removed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove the Gmail app password?",
      message: "Shop emails will fall back to Resend's test sender, which only reaches you, so customers stop getting order emails until you add a new password.",
      confirmLabel: "Remove password",
    });
    if (ok) await save("");
  };

  const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");

  // One glance: is Gmail sending set up and working?
  const badge = readFailed ? <StatusBadge tone="neutral">Status unknown</StatusBadge>
    : stored === null ? <StatusBadge tone="neutral">Checking…</StatusBadge>
    : !stored ? <StatusBadge tone="danger">Not set up</StatusBadge>
    : check ? (check.ok ? <StatusBadge tone="success">Connected</StatusBadge> : <StatusBadge tone="danger">Not working</StatusBadge>)
    : lastProblem ? <StatusBadge tone="warning">Needs a check</StatusBadge>
    : <StatusBadge tone="success">Password saved</StatusBadge>;
  const tooShort = !!draft && !valid;

  return (
    <SectionCard title="Gmail sending" actions={badge}
      description="Sends from your Gmail with an app password.">
      {lastProblem && stored && !check?.ok && (
        <p role="status" className="rp-hint" style={{ margin: "0 0 12px", padding: 12, border: "1px solid var(--rp-warning)", color: "var(--rp-warning)", background: "var(--rp-warning-tint)" }}>
          ! Gmail refused the last email{lastProblem.at ? ` (${new Date(lastProblem.at).toLocaleString()})` : ""}. Choose Check connection, and if it fails save a new app password. {lastProblem.error}
        </p>
      )}
      <TextField label="Gmail app password" type="password" value={draft} autoComplete="new-password"
        placeholder={stored ? "Stored — enter a new password to replace it" : "16 letters, e.g. abcd efgh ijkl mnop"}
        hint={readFailed ? "Couldn't check whether a password is stored." : stored === null ? "Checking…" : stored ? "✓ A password is stored. It is never shown here." : "Create one at myaccount.google.com › Security › App passwords (2-Step Verification must be on)."}
        error={tooShort ? "An app password is 16 letters (spaces are fine)." : undefined}
        onChange={(e) => setDraft(e.target.value)} />
      {!stored && stored !== null && (
        <details style={{ marginTop: 8 }}>
          <summary className="rp-label" style={{ cursor: "pointer", minHeight: 32, display: "inline-flex", alignItems: "center" }}>How to get an app password</summary>
          <ol className="rp-hint" style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
            <li>Sign in to myaccount.google.com as lyricalmyricalbooks@gmail.com.</li>
            <li>Open Security and make sure 2-Step Verification is on.</li>
            <li>Search for “App passwords”, create one called “Shop”, and copy the 16 letters.</li>
            <li>Paste them above and choose Save password. The shop checks it straight away.</li>
          </ol>
        </details>
      )}
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved password status. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={loadStored}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        {/* One main action: save a typed password, else check the stored one. */}
        {stored && !draft ? (
          <PrimaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check connection"}</PrimaryButton>
        ) : (
          <PrimaryButton disabled={!valid || saving} onClick={() => save(cleaned)}>
            {saving ? "Saving…" : "Save password"}
          </PrimaryButton>
        )}
        {stored && draft && (
          <SecondaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check connection"}</SecondaryButton>
        )}
        {stored && (
          <GhostButton disabled={saving} onClick={remove}>Remove</GhostButton>
        )}
      </div>
      {check && (
        <p role="status" className="rp-hint" style={{ margin: "12px 0 0", padding: 12, border: `1px solid var(${tone(check.ok)})`, color: `var(${tone(check.ok)})`, background: `var(${tone(check.ok)}-tint)` }}>
          {check.ok ? "✓ " : "✕ "}{check.message}
        </p>
      )}
      {confirmNode}
    </SectionCard>
  );
}
