import { useState } from "react";
import { BookOpen, LogIn } from "lucide-react";
import { adminApi } from "./api";
import { PrimaryButton } from "./riso/components";
import { loginErrorMessage } from "./loginError";

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

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { token } = await adminApi.login();
      onLogin(token);
    } catch (err: unknown) {
      setError(loginErrorMessage(err));
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
            <h1 className="rp-page-title rp-login-title">Lyrical<span>myrical</span></h1>
            <p className="rp-wordmark-sub">Publishing House · Admin</p>
          </div>
          <p className="rp-card-desc rp-login-lede">
            Sign in with the shop's Google account to manage books, orders and settings.
          </p>
          <PrimaryButton size="lg" icon={<LogIn size={16} aria-hidden />} onClick={handleGoogleLogin} disabled={loading}
            aria-busy={loading || undefined} style={{ width: "100%" }}>
            {loading ? "Waiting for Google…" : "Sign in with Google"}
          </PrimaryButton>
          {loading && <p className="rp-hint rp-login-note" role="status">Finish signing in in the Google window that opened.</p>}
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
