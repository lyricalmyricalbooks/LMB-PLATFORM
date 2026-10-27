import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import toast from "react-hot-toast";
import { auth, db } from "../../lib/firebase";
import { functionFetch } from "../lib/functionsBase";
import { shopProfile } from "../../lib/shopProfile";
import { HowTo, friendlyError } from "./settingsLayout";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm } from "./riso/components";

type Check = { ok: boolean; message: string } | null;

/** Same rule as functions/addressLookup.js addressKeyProblem. */
export function googleKeyProblem(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^AIza[0-9A-Za-z_-]{35}$/.test(v) ? "" : "That doesn't look like a Google API key (it starts with AIza and is 39 characters).";
}

// Google key for the checkout address finder. Stored in the admin-only adminSecrets/addressLookup doc
// (firestore.rules) and used only by the validateAddress Function, never sent to shoppers' browsers.
export function AddressFinderCard() {
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
    getDoc(doc(db, "adminSecrets", "addressLookup"))
      .then((snap) => setStored(Boolean(snap.exists() && snap.data()?.googlePlacesKey)))
      .catch(() => setReadFailed(true));
  };
  useEffect(() => { loadStored(); }, []);

  const cleaned = draft.trim();
  const problem = googleKeyProblem(cleaned);

  // Looks up one sample address through the shop's Function with the saved key.
  const verify = async () => {
    setChecking(true);
    setCheck(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sign in again as the shop administrator.");
      const res = await functionFetch("validateAddress", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: "addressKeyCheck" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `The shop's server answered ${res.status}. Check that Cloud Functions are deployed.`);
      setCheck(data.ok
        ? { ok: true, message: "Google found addresses with this key. Shoppers now get complete addresses with postal codes at checkout." }
        : { ok: false, message: data.error || "Google refused the key." });
    } catch (err: any) {
      setCheck({ ok: false, message: friendlyError(err, "check the key") });
    } finally {
      setChecking(false);
    }
  };

  const save = async (value: string) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "adminSecrets", "addressLookup"), { googlePlacesKey: value, updatedAt: serverTimestamp() });
      setStored(Boolean(value));
      setDraft("");
      setCheck(null);
      toast.success(value ? "Google key saved" : "Google key removed");
      if (value) await verify();
    } catch (err: any) {
      toast.error(friendlyError(err, "save the Google key"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Remove the Google key?",
      message: "Checkout goes back to the free OpenStreetMap suggestions, which miss many house numbers and postal codes.",
      confirmLabel: "Remove key",
    });
    if (ok) await save("");
  };

  const tone = (ok: boolean) => (ok ? "--rp-success" : "--rp-danger");

  return (
    <SectionCard title="Address finder at checkout"
      description="Exact addresses as shoppers type. Google key optional."
      actions={stored !== null && <StatusBadge tone={stored ? "success" : "warning"}>{stored ? "Google" : "Free (OpenStreetMap)"}</StatusBadge>}>
      <HowTo summary="Get a Google key" open={stored === false}>
        <ol className="rp-hint" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: "decimal" }}>
          <li>In Google Cloud (console.cloud.google.com), open the project <strong>{shopProfile.firebase.projectId}</strong> and enable <strong>Places API (New)</strong>.</li>
          <li>APIs &amp; Services › Credentials › Create credentials › API key. Under API restrictions, allow only Places API (New). Leave Application restrictions on None: the shop's server makes the lookups, not shoppers' browsers.</li>
          <li>Paste the key here and choose Save key. Google bills lookups beyond its monthly free allowance, so set a budget alert in Google Cloud › Billing. The shop also stops using the key after 300 lookups a day (checkout then uses the free suggestions until the next day), which keeps a month inside Google's free allowance.</li>
        </ol>
      </HowTo>
      <TextField label="Google Maps Platform API key" type="password" value={draft} autoComplete="off"
        placeholder={stored ? "Stored — enter a new key to replace it" : "AIza…"}
        hint={readFailed ? "Couldn't check whether a key is stored." : stored === null ? "Checking…" : stored ? "✓ A key is stored. It is never shown here." : "No key yet: checkout uses the free OpenStreetMap suggestions."}
        error={problem || undefined}
        onChange={(e) => setDraft(e.target.value)} />
      {readFailed && (
        <p role="alert" className="rp-hint" style={{ margin: "8px 0 0", color: "var(--rp-danger)" }}>
          ✕ Couldn't read the saved key status. <button type="button" className="rp-btn rp-btn-ghost rp-btn-sm" onClick={loadStored}>Try again</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <PrimaryButton disabled={!cleaned || Boolean(problem) || saving} onClick={() => save(cleaned)}>
          {saving ? "Saving…" : "Save key"}
        </PrimaryButton>
        {stored && <SecondaryButton disabled={checking || saving} onClick={verify}>{checking ? "Checking…" : "Check key"}</SecondaryButton>}
        {stored && <GhostButton disabled={saving} onClick={remove}>Remove</GhostButton>}
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
