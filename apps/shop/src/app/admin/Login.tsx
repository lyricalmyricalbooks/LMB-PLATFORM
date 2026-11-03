import { useEffect, useState } from "react";
import { BookOpen, KeyRound, LogIn } from "lucide-react";
import { adminApi } from "./api";
import { PrimaryButton, SecondaryButton, TextField } from "./riso/components";
import { TwoStepNeeded, codeLooksRight, twoStepWords } from "./adminTwoStep";
import { loginErrorMessage } from "./loginError";
import { shopNameFromSettings, wordmarkWords } from "../features/site/shopIdentity";
import { useShopWords } from "./shopWords";

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
  const w = useShopWords();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Google said yes and this person uses authenticator codes: the code step (plan 22.6).
  const [pending, setPending] = useState<TwoStepNeeded | null>(null);
  const [code, setCode] = useState("");
  // The shop's own name (plan 1.16), read from the public settings; nothing is shown until it arrives.
  const [name, setName] = useState("");
  useEffect(() => {
    let live = true;
    Promise.resolve(adminApi.getPublicSettings?.()).then((s) => { if (live) setName(shopNameFromSettings(s)); }).catch(() => { if (live) setName(shopNameFromSettings(null)); });
    return () => { live = false; };
  }, []);
  const words = wordmarkWords(name);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { token } = await adminApi.login();
      onLogin(token);
    } catch (err: unknown) {
      if (err instanceof TwoStepNeeded) { setPending(err); setCode(""); return; }
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

  return (
    <div className="rp">
      <main className="rp-login">
        <div className="rp-card rp-login-card">
          <div className="rp-login-brand">
            <span className="rp-brand-mark rp-login-mark"><BookOpen size={24} aria-hidden /></span>
            <h1 className="rp-page-title rp-login-title">{words.first}{words.rest ? <span> {words.rest}</span> : null}</h1>
            <p className="rp-wordmark-sub">Publishing House · Admin</p>
          </div>
          <p className="rp-card-desc rp-login-lede">
            {pending ? "One more step: the code from your authenticator app." : w("Sign in with the shop's Google account to manage books, orders and settings.")}
          </p>
          {pending ? (
            <form className="rp-stack" style={{ gap: 12 }} data-two-step-code onSubmit={(e) => { e.preventDefault(); void handleCode(); }}>
              <TextField label="Code from your authenticator app" hint="Open the app on your phone and type the 6 digits it shows for this shop." inputMode="numeric"
                autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
              <PrimaryButton type="submit" size="lg" icon={<KeyRound size={16} aria-hidden />} disabled={loading} aria-busy={loading || undefined} style={{ width: "100%" }}>
                {loading ? "Checking…" : "Sign in"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => { setPending(null); setError(""); }}>Use another Google account</SecondaryButton>
            </form>
          ) : (
            <>
              <PrimaryButton size="lg" icon={<LogIn size={16} aria-hidden />} onClick={handleGoogleLogin} disabled={loading}
                aria-busy={loading || undefined} style={{ width: "100%" }}>
                {loading ? "Waiting for Google…" : "Sign in with Google"}
              </PrimaryButton>
              {loading && <p className="rp-hint rp-login-note" role="status">Finish signing in in the Google window that opened.</p>}
            </>
          )}
          {error && <p role="alert" className="rp-login-error"><span aria-hidden="true">⚠</span> {error}</p>}
          <div className="rp-login-foot">
            <span className="rp-hint">Private area — only the shop owner can sign in.</span>
            <a className="rp-login-link" href={shopHref()}>← Back to the shop</a>
          </div>
        </div>
      </main>
    </div>
  );
}
