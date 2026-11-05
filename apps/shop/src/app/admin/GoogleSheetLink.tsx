import { useState } from "react";
import { BrandMark } from "../components/brand/BrandLogo";
import { googleConnectApi, useGoogleConnect, type GoogleExtra } from "./googleConnect";
import { NOT_A_SHEET, openGoogleSheet, parseSheetLink } from "./googleSheet";
import { PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { readProblem } from "./spreadsheetFile";

// "Google Sheet" beside a bring-a-file window's file button (plan 23.42): paste the sheet's link and it comes in like a
// chosen file, read with the shop's one Google sign-in. Shown only to a shop whose Google account is linked.

const PENDING = "colophon.pendingSheetLink";
const remembered = () => { try { return sessionStorage.getItem(PENDING) || ""; } catch { return ""; } };
const remember = (link: string) => { try { if (link) sessionStorage.setItem(PENDING, link); else sessionStorage.removeItem(PENDING); } catch { /* private window: paste it again */ } };

export function GoogleSheetLink({ disabled, onFile }: { disabled?: boolean; onFile: (file: File) => void }) {
  const google = useGoogleConnect();
  const [open, setOpen] = useState(() => !!remembered());
  const [link, setLink] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allow, setAllow] = useState(false);
  const status = google.status;
  if (google.mode !== "platform" || !status?.enabled || !status.connected || !status.extrasOffered?.includes("drive")) return null;

  async function bringIn() {
    if (!parseSheetLink(link)) { setError(NOT_A_SHEET); return; }
    setBusy(true); setError(""); setAllow(false);
    try {
      const file = await openGoogleSheet(link);
      if (file === "allow") { setAllow(true); return; }
      remember(""); setOpen(false); setLink("");
      onFile(file);
    } catch (err) {
      setError(readProblem(err, "Google couldn't read that sheet just now. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  async function allowReading() {
    setBusy(true); setError("");
    try {
      // Everything already switched on stays on; Google asks only for what is new.
      const extras = [...new Set<GoogleExtra>([...(status?.extrasChosen ?? []), "drive"])];
      remember(link);
      window.location.assign(await googleConnectApi.connectLink(extras));
    } catch (err: any) {
      remember("");
      setError(err?.message || "Couldn't open Google just now.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <SecondaryButton icon={<BrandMark id="google" size={16} />} disabled={disabled} onClick={() => { setOpen(true); setError(""); }}>
        Google Sheet
      </SecondaryButton>
    );
  }
  return (
    // Not a <form>: the windows it sits in may be forms themselves.
    <div role="group" className="rp-stack" style={{ gap: 8, flexBasis: "100%" }} aria-label="Bring in a Google Sheet">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <TextField label="Google Sheet link" type="url" inputMode="url" autoComplete="off" spellCheck={false} autoFocus
            placeholder="https://docs.google.com/spreadsheets/d/…" value={link} disabled={busy || disabled}
            error={error || undefined} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!busy && !allow) void bringIn(); } }} onChange={(e) => { setLink(e.target.value); setError(""); setAllow(false); }} />
        </div>
        <PrimaryButton busy={busy && !allow} disabled={disabled || !link.trim() || allow} onClick={() => void bringIn()}>Bring in</PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => { setOpen(false); setError(""); setAllow(false); remember(""); }}>Cancel</SecondaryButton>
      </div>
      {allow && (
        <div role="status" className="rp-stack" style={{ gap: 8 }}>
          <p className="rp-hint" style={{ margin: 0 }}>Let your shop read sheets in the Google account {status.accountEmail || "linked to it"}. You come back here afterwards.</p>
          <div><SecondaryButton icon={<BrandMark id="google" size={16} />} busy={busy} onClick={() => void allowReading()}>Allow with Google</SecondaryButton></div>
        </div>
      )}
    </div>
  );
}
