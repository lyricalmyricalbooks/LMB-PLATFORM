import { useEffect, useState } from "react";
import { BookOpen, KeyRound } from "lucide-react";
import { GoogleSignInButton } from "../components/brand/BrandLogo";
import { adminApi } from "./api";
import { PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { BACKUP_USED_KEY, BackupCodeError, TwoStepNeeded, backupCodeLooksRight, codeLooksRight, twoStepWords } from "./adminTwoStep";
import { loginErrorMessage } from "./loginError";
import { shopNameFromSettings, wordmarkWords } from "../features/site/shopIdentity";
import { invitedEmail, loginWords } from "./loginWords";

interface LoginProps {
  onLogin: (token: string) => void;
}

/** The shop's front page, worked out from the admin address (the site may live under a sub-path). */
function shopHref() {
  const path = window.location.pathname;
  const at = path.toLowerCase().indexOf("/admin");
  return (at !== -1 ? path.substring(0, at) : "") + "/";
}

export function Login({ onLogin }: LoginProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Google said yes and this person uses authenticator codes: the code step (plan 22.6).
  const [pending, setPending] = useState<TwoStepNeeded | null>(null);
  const [code, setCode] = useState("");
  // Lost phone: a backup code instead of the app's code (plan 22.9).
  const [backup, setBackup] = useState(false);
  // The shop's own name (plan 1.16), read from the public settings; nothing is shown until it arrives.
  const [name, setName] = useState("");
  // What the shop sells, from the same public settings: nobody is signed in yet, so the admin's own words aren't known.
  const [sells, setSells] = useState<string | null>(null);
  const say = loginWords(sells);
  // Opened from a Team invite: name the account to use, and offer it first in Google's chooser.
  const [invite] = useState(() => invitedEmail(typeof window === "undefined" ? "" : window.location.search));
  useEffect(() => {
    let live = true;
    Promise.resolve(adminApi.getPublicSettings?.()).then((s) => { if (live) { setName(shopNameFromSettings(s)); setSells(typeof s?.sells === "string" ? s.sells : null); } }).catch(() => { if (live) setName(shopNameFromSettings(null)); });
    return () => { live = false; };
  }, []);
  const words = wordmarkWords(name);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { token } = await adminApi.login(invite);
      // The invite has done its job: keep it out of the address the admin goes on to use.
      if (invite) try { const url = new URL(window.location.href); url.searchParams.delete("invite"); window.history.replaceState(window.history.state, "", url.toString()); } catch { /* the address stays as it is */ }
      onLogin(token);
    } catch (err: unknown) {
      if (err instanceof TwoStepNeeded) { setPending(err); setCode(""); setBackup(false); return; }
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async () => {
    if (!pending) return;
    if (!codeLooksRight(code)) { setError("Type the 6 digits your authenticator app shows."); return; }
    setLoading(true);
    setError("");
    try {
      const { token } = await adminApi.finishTwoStepLogin(pending, code);
      onLogin(token);
    } catch (err: unknown) {
      // The Team-list refusal reads the same as with Google alone; a wrong or late code in two-step words.
      setError(/^Unauthorized/i.test(String((err as Error)?.message)) ? loginErrorMessage(err) : twoStepWords(err));
      if (/took too long/.test(twoStepWords(err))) setPending(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    if (!pending) return;
    if (!backupCodeLooksRight(code)) { setError("Type one of your backup codes: 10 letters and numbers, like ABCDE-FGHJK."); return; }
    setLoading(true);
    setError("");
    try {
      const { token, left } = await adminApi.signInWithBackupCode(pending, code);
      // Settings › Security says what happened and asks them to set up their app again.
      try { sessionStorage.setItem(BACKUP_USED_KEY, String(left)); } catch { /* the page still works without the note */ }
      window.location.hash = "#settings/security";
      onLogin(token);
    } catch (err: unknown) {
      if (err instanceof BackupCodeError) {
        setError(err.message);
        if (err.status === 401) setPending(null);
      } else {
        setError(/^Unauthorized/i.test(String((err as Error)?.message)) ? loginErrorMessage(err) : twoStepWords(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const switchToBackup = (on: boolean) => { setBackup(on); setCode(""); setError(""); };

  return (
    <div className="rp">
      <main className="rp-login">
        <div className="rp-card rp-login-card">
          <div className="rp-login-brand">
            <span className="rp-brand-mark rp-login-mark"><BookOpen size={24} aria-hidden /></span>
            <h1 className="rp-page-title rp-login-title">{words.first}{words.rest ? <span> {words.rest}</span> : null}</h1>
            <p className="rp-wordmark-sub">{say.sub}</p>
          </div>
          <p className="rp-card-desc rp-login-lede">
            {pending && backup ? "Lost your phone? A backup code lets you in. You'll set up your app again straight after." : pending ? "One more step: the code from your authenticator app."
              : invite ? <>You're invited to the team. Sign in with Google as <strong>{invite}</strong>.</> : say.lede}
          </p>
          {pending && backup ? (
            <form className="rp-stack" style={{ gap: 12 }} data-two-step-backup onSubmit={(e) => { e.preventDefault(); void handleBackup(); }}>
              <TextField label="Backup code" hint="One of the codes you saved when you set up two-step sign-in. Each works once." autoComplete="off"
                autoCapitalize="characters" spellCheck={false} autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
              <PrimaryButton type="submit" size="lg" icon={<KeyRound size={16} aria-hidden />} disabled={loading} aria-busy={loading || undefined} style={{ width: "100%" }}>
                {loading ? "Checking…" : "Sign in with backup code"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => switchToBackup(false)}>Use the code from my app instead</SecondaryButton>
            </form>
          ) : pending ? (
            <form className="rp-stack" style={{ gap: 12 }} data-two-step-code onSubmit={(e) => { e.preventDefault(); void handleCode(); }}>
              <TextField label="Code from your authenticator app" hint="Open the app on your phone and type the 6 digits it shows for this shop." inputMode="numeric"
                autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
              <PrimaryButton type="submit" size="lg" icon={<KeyRound size={16} aria-hidden />} disabled={loading} aria-busy={loading || undefined} style={{ width: "100%" }}>
                {loading ? "Checking…" : "Sign in"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => switchToBackup(true)}>Lost your phone? Use a backup code</SecondaryButton>
              <SecondaryButton type="button" onClick={() => { setPending(null); setError(""); }}>Use another Google account</SecondaryButton>
            </form>
          ) : (
            <>
              {/* Google's own button (its branding rules fix the words, so the wait shows in the note below). */}
              <GoogleSignInButton onClick={handleGoogleLogin} disabled={loading} aria-busy={loading || undefined} style={{ width: "100%" }}>
                Sign in with Google
              </GoogleSignInButton>
              {loading && <p className="rp-hint rp-login-note" role="status">Finish signing in in the Google window that opened.</p>}
            </>
          )}
          {error && <p role="alert" className="rp-login-error"><span aria-hidden="true">⚠</span> {error}</p>}
          <div className="rp-login-foot">
            <span className="rp-hint">Private area — only the shop's team can sign in.</span>
            <a className="rp-login-link" href={shopHref()}>← Back to the shop</a>
          </div>
        </div>
      </main>
    </div>
  );
}
