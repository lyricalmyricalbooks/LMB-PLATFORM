import { useId, useState } from "react";
import { PLACEHOLDER_INSTAGRAM } from "../features/site/constants";
import { SOCIAL_NETWORKS, readSocialInput, savedSocialAccounts, socialIconPath, socialShortAddress, type SocialNetwork } from "../features/site/socialAccounts";
import "./socialAccounts.css";

/**
 * Settings › General › Your shop › Social media: the shop's accounts, typed as @name or pasted as a link. Each one that's
 * filled in shows as a small icon on the website (Studio › Style › Footer & social links decides where and how).
 * The whole map is saved as `settings/website.social` with the page's other sections.
 */
export function SocialAccountsFields({ settings, onChange, books }: {
  settings: any;
  onChange: (social: Record<string, string>) => void;
  books: boolean;
}) {
  const saved = savedSocialAccounts(settings);
  const value = (k: string) => {
    const v = String(saved[k] ?? "");
    return v === PLACEHOLDER_INSTAGRAM ? "" : v;
  };
  const networks = SOCIAL_NETWORKS.filter((n) => books || !n.booksOnly);
  const [opened, setOpened] = useState<string[]>([]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const shown = networks.filter((n) => n.popular || value(n.key) || opened.includes(n.key));
  const more = networks.filter((n) => !shown.includes(n));

  const write = (key: string, text: string) => {
    const next: Record<string, string> = {};
    for (const n of SOCIAL_NETWORKS) { const v = value(n.key); if (v) next[n.key] = v; }
    if (text) next[key] = text; else delete next[key];
    onChange(next);
  };
  const tidy = (key: string) => {
    const typed = value(key).trim();
    const { url, problem } = readSocialInput(key, typed);
    setProblems((p) => ({ ...p, [key]: problem || "" }));
    if (url && url !== typed) write(key, url);
  };

  return (
    <div className="rp-social">
      <div className="rp-social-grid">
        {shown.map((n) => (
          <AccountField key={n.key} network={n} value={value(n.key)} problem={problems[n.key]}
            onType={(t) => { write(n.key, t); if (problems[n.key]) setProblems((p) => ({ ...p, [n.key]: "" })); }}
            onDone={() => tidy(n.key)} />
        ))}
      </div>
      {more.length > 0 && (
        <div className="rp-social-more" role="group" aria-label="Add another account">
          {more.map((n) => (
            <button key={n.key} type="button" className="rp-social-add" onClick={() => setOpened((o) => [...o, n.key])}>
              <Glyph network={n} /> {n.name}
            </button>
          ))}
        </div>
      )}
      <p className="rp-fk-hint rp-social-foot">
        Icons show in your website's footer. <a href="#designer?tab=style">Change how they look in Design</a>
      </p>
    </div>
  );
}

function Glyph({ network }: { network: SocialNetwork }) {
  return <svg className="rp-social-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={socialIconPath(network.key)} /></svg>;
}

function AccountField({ network, value, problem, onType, onDone }: {
  network: SocialNetwork; value: string; problem?: string; onType: (text: string) => void; onDone: () => void;
}) {
  const id = useId();
  const { url } = readSocialInput(network.key, value);
  const linked = !problem && url && /^https:\/\//.test(value);
  return (
    <div className="rp-fk-field rp-social-field" data-missing={problem ? "" : undefined} data-filled={linked ? "" : undefined}>
      <label htmlFor={id} className="rp-fk-label">{network.name}</label>
      <div className="rp-fk-control" data-prefix="">
        <span className="rp-fk-affix rp-social-affix" aria-hidden><Glyph network={network} /></span>
        <input id={id} value={value} placeholder={network.placeholder} autoComplete="off" spellCheck={false} inputMode="url"
          aria-invalid={problem ? true : undefined} aria-describedby={problem || linked ? `${id}-hint` : undefined}
          onChange={(e) => onType(e.target.value)} onBlur={onDone}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onDone(); } }} />
      </div>
      {problem ? <span id={`${id}-hint`} className="rp-fk-hint" data-error="" role="alert">{problem}</span>
        : linked ? <a id={`${id}-hint`} className="rp-fk-hint rp-social-check" href={url} target="_blank" rel="noopener noreferrer">{socialShortAddress(url)} ↗</a>
        : null}
    </div>
  );
}
