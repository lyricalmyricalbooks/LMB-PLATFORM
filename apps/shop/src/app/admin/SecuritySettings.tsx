// Settings › Security (code plan 22.6): two-step sign-in, a code from an authenticator app after Google, for whoever is
// signed in. On a paid plan the owner needs it for changes to the plan, cards and billing details (Settings › Plan and
// Billing), which then finish right here in the admin. The steps are in adminTwoStep.ts; the picture to scan is drawn
// in the browser (qrcode-generator), so the setup key never leaves the page.
import { useCallback, useEffect, useState } from "react";
import { Copy, Download, KeyRound, ShieldCheck } from "lucide-react";
import type { TotpSecret, User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { adminApi } from "./api";
import { DestructiveButton, PrimaryButton, SecondaryButton, SectionCard, StatusBadge, TextField, useConfirm } from "./riso/components";
import { BACKUP_USED_KEY, appsSetUp, backupApiFor, backupCodesText, codeLooksRight, finishSetup, firebaseTwoStep, startSetup, twoStepWords, type BackupApi, type BackupCodes, type BackupStatus, type TwoStepAuth } from "./adminTwoStep";
import { shopNameFromSettings } from "../features/site/shopIdentity";
import { planDate } from "./platformPlan";

type Setup = { secret: TotpSecret; key: string; link: string; picture: string };

/** The `otpauth://` link as a picture to scan (an image data address), or "" if it can't be drawn. */
async function pictureOf(link: string): Promise<string> {
  try {
    const { default: qrcode } = await import("qrcode-generator");
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    return qr.createDataURL(5, 2);
  } catch {
    return "";
  }
}

/** The backup code note left by the sign-in page: how many codes are left, or null. */
function readBackupNote(): number | null {
  try {
    const left = sessionStorage.getItem(BACKUP_USED_KEY);
    return left === null ? null : Number(left) || 0;
  } catch {
    return null;
  }
}

export function SecuritySettings({ two = firebaseTwoStep(auth), user = auth.currentUser, backup: backupApi }: { two?: TwoStepAuth; user?: User | null; backup?: BackupApi }) {
  const backup = backupApi ?? (user ? backupApiFor(user) : null);
  const [apps, setApps] = useState(() => (user ? appsSetUp(two, user) : []));
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [confirm, dialog] = useConfirm();
  const [backupUsed] = useState(readBackupNote);
  // Shown on this visit only.
  useEffect(() => { try { sessionStorage.removeItem(BACKUP_USED_KEY); } catch { /* nothing to clear */ } }, []);
  const [codesLeft, setCodesLeft] = useState<BackupStatus | null>(null);
  const [newCodes, setNewCodes] = useState<BackupCodes | null>(null);
  const [backupError, setBackupError] = useState("");
  const [copied, setCopied] = useState(false);
  const [shopName, setShopName] = useState("");
  const refresh = useCallback(() => { if (user) setApps(appsSetUp(two, user)); }, [two, user]);
  useEffect(refresh, [refresh]);
  const on = apps.length > 0;
  useEffect(() => {
    if (!on || !backup) return;
    let live = true;
    // Codes just made (right after turning it on) win over a status read that started before them.
    backup.status().then((s) => { if (live) setCodesLeft((made) => made ?? s); }).catch(() => {});
    return () => { live = false; };
    // The status is read when two-step turns on or off, not on every render.
  }, [on]);

  if (!user) return null;

  const begin = async () => {
    setBusy("start");
    setError("");
    try {
      const name = shopNameFromSettings(await Promise.resolve(adminApi.getPublicSettings?.()).catch(() => null));
      setShopName(name);
      const started = await startSetup(two, user, name);
      setSetup({ ...started, picture: await pictureOf(started.link) });
      setCode("");
    } catch (err) {
      setError(twoStepWords(err));
    } finally {
      setBusy(null);
    }
  };

  const turnOn = async () => {
    if (!setup) return;
    if (!codeLooksRight(code)) { setError("Type the 6 digits your authenticator app shows."); return; }
    setBusy("on");
    setError("");
    try {
      await finishSetup(two, user, setup.secret, code);
      setSetup(null);
      setDone(true);
      refresh();
      // Best practice: the backup codes come straight after setup, while the person is still here.
      await makeCodes();
    } catch (err) {
      setError(twoStepWords(err));
    } finally {
      setBusy(null);
    }
  };

  const makeCodes = async () => {
    if (!backup) return;
    setBusy("codes");
    setBackupError("");
    setCopied(false);
    try {
      const made = await backup.make();
      setNewCodes(made);
      setCodesLeft({ left: made.codes.length, madeAt: made.madeAt });
    } catch (err) {
      setBackupError((err as Error)?.message || "Something went wrong. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const remake = async () => {
    const ok = await confirm({
      title: "Make new backup codes?",
      message: "Your old backup codes stop working straight away. Save the new ones somewhere safe.",
      confirmLabel: "Make new codes",
    });
    if (ok) await makeCodes();
  };

  const codesFile = newCodes ? backupCodesText(newCodes.codes, shopName, newCodes.madeAt) : "";
  const copyCodes = async () => {
    try { await navigator.clipboard.writeText(codesFile); setCopied(true); } catch { setBackupError("Couldn't copy. Select the codes and copy them yourself, or download them."); }
  };
  const downloadCodes = () => {
    const url = URL.createObjectURL(new Blob([codesFile], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "backup-codes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const turnOff = async (uid: string) => {
    const ok = await confirm({
      title: "Turn off two-step sign-in?",
      message: "Signing in will only need Google again. On a paid plan you won't be able to change your plan, cards or billing details until you turn it back on.",
      confirmLabel: "Turn it off",
    });
    if (!ok) return;
    setBusy("off");
    setError("");
    try {
      await two.unenroll(user, uid);
      setDone(false);
      setNewCodes(null);
      setCodesLeft(null);
      refresh();
    } catch (err) {
      setError(twoStepWords(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rp-stack" style={{ gap: 16 }} data-security-settings="">
      {dialog}
      <SectionCard title="Two-step sign-in" description="After Google, type a code from an authenticator app on your phone. Someone who gets your Google password still can't get in."
        actions={<StatusBadge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</StatusBadge>} collapsible={false}>
        <div className="rp-stack" style={{ gap: 12 }}>
          {backupUsed !== null && !on && (
            <div role="status" className="rp-alert" data-tone="warning" data-backup-used="">
              <span className="rp-alert-glyph" aria-hidden="true">!</span>
              <div className="rp-alert-text">
                <strong className="rp-alert-title">You signed in with a backup code.</strong>
                <span className="rp-alert-detail">Set up your new phone below. {backupUsed === 1 ? "1 backup code left." : `${backupUsed} backup codes left.`}</span>
              </div>
            </div>
          )}
          {done && (
            <div role="status" className="rp-alert" data-tone="success">
              <span className="rp-alert-glyph" aria-hidden="true">✓</span>
              <div className="rp-alert-text">
                <strong className="rp-alert-title">Two-step sign-in is on.</strong>
                <span className="rp-alert-detail">Sign out and in again with your code to change your plan, cards or billing details on a paid plan. From now on, every sign-in asks for a code.</span>
              </div>
              <div className="rp-alert-actions"><SecondaryButton size="sm" onClick={() => void adminApi.logout()}>Sign out now</SecondaryButton></div>
            </div>
          )}
          {on ? (
            <ul className="rp-stack" style={{ gap: 0, listStyle: "none", margin: 0, padding: 0 }}>
              {apps.map((app) => (
                <li key={app.uid} className="flex flex-wrap items-center gap-3" style={{ padding: "12px 0", borderTop: "1px solid var(--rp-divider)" }}>
                  <KeyRound size={18} aria-hidden />
                  <span style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{app.displayName || "Authenticator app"}</span>
                    <span className="rp-hint" style={{ display: "block" }}>Set up {planDate(app.enrollmentTime)}</span>
                  </span>
                  <DestructiveButton size="sm" busy={busy === "off"} onClick={() => void turnOff(app.uid)}>Turn off</DestructiveButton>
                </li>
              ))}
            </ul>
          ) : setup ? (
            <form className="rp-stack" style={{ gap: 12 }} data-two-step-setup onSubmit={(e) => { e.preventDefault(); void turnOn(); }}>
              <ol className="rp-stack" style={{ gap: 6, margin: 0, paddingLeft: 20, listStyle: "decimal" }}>
                <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password or similar).</li>
                <li>Scan this picture with it, or type the setup code below.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              {setup.picture && <img src={setup.picture} alt="Picture to scan with your authenticator app" width={180} height={180} style={{ imageRendering: "pixelated", border: "2px solid currentColor" }} />}
              <p style={{ margin: 0 }}><span className="rp-hint" style={{ display: "block" }}>Setup code to type instead</span><code style={{ wordBreak: "break-all", fontSize: 15 }}>{setup.key}</code></p>
              <TextField label="Code from the app" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="flex flex-wrap gap-3">
                <PrimaryButton type="submit" busy={busy === "on"}>Turn on two-step sign-in</PrimaryButton>
                <SecondaryButton type="button" onClick={() => { setSetup(null); setError(""); }}>Cancel</SecondaryButton>
              </div>
            </form>
          ) : (
            <div><PrimaryButton icon={<ShieldCheck size={16} aria-hidden />} busy={busy === "start"} onClick={() => void begin()}>Set up two-step sign-in</PrimaryButton></div>
          )}
          {error && <p role="alert" className="rp-login-error" style={{ margin: 0 }}><span aria-hidden="true">⚠</span> {error}</p>}
        </div>
      </SectionCard>
      {on && backup && (
        <SectionCard title="Backup codes" description="Lost your phone? Type one of these instead of the app's code. Each works once." collapsible={false}
          actions={codesLeft ? <StatusBadge tone={codesLeft.left > 2 ? "success" : codesLeft.left > 0 ? "warning" : "danger"}>{codesLeft.left} left</StatusBadge> : undefined}>
          <div className="rp-stack" style={{ gap: 12 }} data-backup-codes="">
            {newCodes ? (
              <>
                <p style={{ margin: 0 }}><strong>Save these now.</strong> You won't see them again. Print them, or keep them in your password manager, not on the phone with your authenticator app.</p>
                <ol data-new-codes="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
                  {newCodes.codes.map((c) => <li key={c}><code style={{ fontSize: 15 }}>{c}</code></li>)}
                </ol>
                <div className="flex flex-wrap gap-3">
                  <SecondaryButton type="button" icon={<Copy size={16} aria-hidden />} onClick={() => void copyCodes()}>{copied ? "Copied" : "Copy codes"}</SecondaryButton>
                  <SecondaryButton type="button" icon={<Download size={16} aria-hidden />} onClick={downloadCodes}>Download codes</SecondaryButton>
                  <SecondaryButton type="button" onClick={() => setNewCodes(null)}>I've saved them</SecondaryButton>
                </div>
              </>
            ) : codesLeft && codesLeft.left > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span style={{ flex: "1 1 200px" }} className="rp-hint">{codesLeft.left === 1 ? "1 code" : `${codesLeft.left} codes`} left, made {planDate(codesLeft.madeAt)}.{codesLeft.left <= 2 ? " Make new ones soon." : ""}</span>
                <SecondaryButton type="button" busy={busy === "codes"} onClick={() => void remake()}>Make new codes</SecondaryButton>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span style={{ flex: "1 1 200px" }} className="rp-hint">You have no backup codes. Without them, a lost phone means asking for help to get back in.</span>
                <PrimaryButton type="button" busy={busy === "codes"} onClick={() => void makeCodes()}>Make backup codes</PrimaryButton>
              </div>
            )}
            {backupError && <p role="alert" className="rp-login-error" style={{ margin: 0 }}><span aria-hidden="true">⚠</span> {backupError}</p>}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
