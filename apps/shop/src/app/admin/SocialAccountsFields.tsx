import { useId, useState } from "react";
import { PLACEHOLDER_INSTAGRAM } from "../features/site/constants";
import { SOCIAL_NETWORKS, moveSocial, orderedNetworks, readSocialInput, savedSocialAccounts, socialIconPath, socialShortAddress, type SocialNetwork } from "../features/site/socialAccounts";
import { checkSocialLinks, type SocialCheck } from "./oldShopApi";
import "./socialAccounts.css";

/**
 * Settings › General › Your shop › Social media: the shop's accounts, typed as @name or pasted as a link. Each one that's
 * filled in shows as a small icon on the website (Studio › Style › Footer & social links decides where and how).
 * The whole map is saved as `settings/website.social` with the page's other sections; the icons' order (the arrows on
 * filled accounts) as `settings/website.socialOrder`. Check my links asks the server whether each page still exists.
 */
export function SocialAccountsFields({ settings, onChange, onOrder, books }: {
  settings: any;
  onChange: (social: Record<string, string>) => void;
  onOrder: (order: string[]) => void;
  books: boolean;
}) {
  const saved = savedSocialAccounts(settings);
  const value = (k: string) => {
    const v = String(saved[k] ?? "");
    return v === PLACEHOLDER_INSTAGRAM ? "" : v;
  };
  const order = settings?.socialOrder;
  const networks = orderedNetworks(order).filter((n) => books || !n.booksOnly);
  const [opened, setOpened] = useState<string[]>([]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const shown = networks.filter((n) => n.popular || value(n.key) || opened.includes(n.key));
  const more = networks.filter((n) => !shown.includes(n));
  // Filled accounts first, in the owner's order (what the website shows); then the empty ones offered.
  const filled = shown.filter((n) => readSocialInput(n.key, value(n.key)).url).map((n) => n.key as string);
  const grid = [...shown.filter((n) => filled.includes(n.key)), ...shown.filter((n) => !filled.includes(n.key))];
  const [checks, setChecks] = useState<Record<string, SocialCheck>>({});
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const runCheck = async () => {
    setChecking(true); setCheckError("");
    try {
      const links: Record<string, string> = {};
      for (const k of filled) links[k] = readSocialInput(k, value(k)).url;
      setChecks(await checkSocialLinks(links));
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : "We couldn't check your links just now.");
    } finally { setChecking(false); }
  };
  const missing = filled.filter((k) => checks[k] === "missing");

  const write = (key: string, text: string) => {
    const next: Record<string, string> = {};
    for (const n of SOCIAL_NETWORKS) { const v = value(n.key); if (v) next[n.key] = v; }
    if (text) next[key] = text; else delete next[key];
    onChange(next);
    if (checks[key]) setChecks((c) => { const n = { ...c }; delete n[key]; return n; });
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
        {grid.map((n) => (
          <AccountField key={n.key} network={n} value={value(n.key)} problem={problems[n.key]} check={checks[n.key]}
            move={filled.length > 1 && filled.includes(n.key) ? {
              up: filled.indexOf(n.key) > 0 ? () => onOrder(moveSocial(order, filled, n.key, -1)) : undefined,
              down: filled.indexOf(n.key) < filled.length - 1 ? () => onOrder(moveSocial(order, filled, n.key, 1)) : undefined,
            } : undefined}
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
      <div className="rp-social-foot-row">
        <p className="rp-fk-hint rp-social-foot">
          Icons show in this order on your website. <a href="#designer?tab=style">Change how they look in Design</a>
        </p>
        {filled.length > 0 && (
          <button type="button" className="rp-social-checkbtn" onClick={runCheck} disabled={checking} aria-busy={checking || undefined}>
            {checking ? "Checking…" : "Check my links"}
          </button>
        )}
      </div>
      <p className="rp-social-status" role="status">
        {checkError || (missing.length ? `${missing.length === 1 ? "One page" : `${missing.length} pages`} couldn't be found. Check the address.`
          : Object.keys(checks).length ? "Your links look fine." : "")}
      </p>
    </div>
  );
}

function Glyph({ network }: { network: SocialNetwork }) {
  return <svg className="rp-social-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={socialIconPath(network.key)} /></svg>;
}

function AccountField({ network, value, problem, check, move, onType, onDone }: {
  network: SocialNetwork; value: string; problem?: string; check?: SocialCheck;
  move?: { up?: () => void; down?: () => void };
  onType: (text: string) => void; onDone: () => void;
}) {
  const id = useId();
  const { url } = readSocialInput(network.key, value);
  const linked = !problem && url && /^https:\/\//.test(value);
  const gone = linked && check === "missing";
  return (
    <div className="rp-fk-field rp-social-field" data-missing={problem || gone ? "" : undefined} data-filled={linked ? "" : undefined}>
      <div className="rp-social-head">
        <label htmlFor={id} className="rp-fk-label">{network.name}</label>
        {move && (
          <span className="rp-social-order">
            <button type="button" className="rp-social-arrow" onClick={move.up} disabled={!move.up} aria-label={`Move ${network.name} earlier`}>↑</button>
            <button type="button" className="rp-social-arrow" onClick={move.down} disabled={!move.down} aria-label={`Move ${network.name} later`}>↓</button>
          </span>
        )}
      </div>
      <div className="rp-fk-control" data-prefix="">
        <span className="rp-fk-affix rp-social-affix" aria-hidden><Glyph network={network} /></span>
        <input id={id} value={value} placeholder={network.placeholder} autoComplete="off" spellCheck={false} inputMode="url"
          aria-invalid={problem ? true : undefined} aria-describedby={problem || linked ? `${id}-hint` : undefined}
          onChange={(e) => onType(e.target.value)} onBlur={onDone}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onDone(); } }} />
      </div>
      {problem ? <span id={`${id}-hint`} className="rp-fk-hint" data-error="" role="alert">{problem}</span>
        : gone ? <span id={`${id}-hint`} className="rp-fk-hint" data-error="">{network.name} says there's no page at {socialShortAddress(url)}.</span>
        : linked ? <a id={`${id}-hint`} className="rp-fk-hint rp-social-check" href={url} target="_blank" rel="noopener noreferrer">{socialShortAddress(url)} ↗</a>
        : null}
    </div>
  );
}
