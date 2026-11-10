// "Your web address" in setup (Settings › General, and the setup guide's step): the press brings a domain it already
// has, goes to buy one, or keeps the free address for now, as the big shop builders ask. Nothing is connected here:
// there is no shop yet. The domain is kept on the press's setup record (door.saveDomain looks up where it was bought),
// and once the shop is made it is connected in one step, made the main address as soon as it works, with www sent on
// to it (platform signup/shopMaker.js). Press-facing words never name the technical lines behind it.
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { GhostButton, PrimaryButton, SectionCard, TextField, useRisoToast } from "../app/admin/riso/components";
import { BrandLogo } from "../app/components/brand/BrandLogo";
import type { FreeNameCheck, SetupChange, SetupDoor, SetupPress } from "./door";

/** The anchor the setup guide's step scrolls to. */
export const WEB_ADDRESS_ANCHOR = "web-address";

/** Country endings shoppers there trust most, for the GoDaddy search (a Canadian press is shown the .ca first). */
const LOCAL_ENDINGS: Record<string, string> = { CA: "ca", GB: "co.uk", IE: "ie", FR: "fr", DE: "de", NL: "nl", AU: "com.au", NZ: "co.nz" };

/** A domain-seller search for the press's name (with its country's ending, when it has one), so it lands on names it might want. */
export function buyDomainUrl(pressName: string, country = ""): string {
  const name = pressName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "") || "yourpress";
  const ending = LOCAL_ENDINGS[country];
  return `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(ending ? `${name}.${ending}` : name)}`;
}

/** The line under the GoDaddy button: which endings shoppers remember. */
export function endingHint(country = ""): string {
  const ending = LOCAL_ENDINGS[country];
  return ending
    ? `A .${ending} name tells shoppers you're local.`
    : "";
}

/** What happens with the kept domain once the shop is made, in plain words. */
export function domainPlan(press: Pick<SetupPress, "domain" | "domainSeller" | "domainEasy">): string {
  const seller = press.domainSeller || "";
  if (press.domainEasy && seller) return `Bought at ${seller}. Once your shop is made, you press Allow there once.`;
  if (seller) return `Bought at ${seller}. Once your shop is made, we show you what to copy there.`;
  return "Once your shop is made, we show you how to connect it.";
}

/** www.yourpress.com goes to yourpress.com (and the other way round); a sub-address has no partner. */
export function partnerOf(domain: string): string {
  const labels = domain.split(".");
  if (labels[0] === "www" && labels.length === 3) return labels.slice(1).join(".");
  return labels.length === 2 ? `www.${domain}` : "";
}

/** The free address the shop will get, with what happens if another shop has the name. */
/** A name typed for the free address, as the platform cleans it: "Moth Books!" -> "moth-books" (signup/pressRecord.js). */
export function freeNamePreview(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");
}

type FreeLineProps = { press: SetupPress; save: (c: SetupChange) => Promise<SetupPress>; check?: SetupDoor["checkFreeName"]; inSetup: boolean };

/** How long typing must pause before a name is checked. */
const CHECK_AFTER_MS = 350;

/** "Your free address: moth-press.<shop domain>", and a name of the press's own in its place. */
function FreeAddressLine({ press, save, check, inSetup }: FreeLineProps) {
  const address = press.freeAddress ?? "";
  const shopDomain = address.slice(address.indexOf(".") + 1);
  // A press whose own name can't be an address is asked for a name straight away.
  const [editing, setEditing] = useState(Boolean(press.freeNameNeeded && inSetup));
  const [draft, setDraft] = useState(press.freeName ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const name = freeNamePreview(draft);
  // The platform's answer for what's typed now: why it can't be used, or whether another shop has it.
  const [checked, setChecked] = useState<FreeNameCheck | null>(null);
  useEffect(() => {
    if (!editing || !check || !name) { setChecked(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      check(press.pressId, name).then((answer) => { if (live) setChecked(answer); }, () => { if (live) setChecked(null); });
    }, CHECK_AFTER_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [name, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  // A name picked earlier is checked again on the way in: if another shop has taken it since, the press is asked for a new one.
  useEffect(() => {
    const saved = press.freeName ?? "";
    if (!inSetup || !check || !saved || editing) return;
    let live = true;
    check(press.pressId, saved).then((answer) => {
      if (live && answer.name === saved && !answer.problem && !answer.available) { setDraft(saved); setChecked(answer); setEditing(true); }
    }, () => {});
    return () => { live = false; };
  }, [press.freeName]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = checked?.name === name ? checked : null;
  const suggestions = current && !current.available && !current.problem ? current.suggestions ?? [] : [];
  const refusal = current?.problem || (current && !current.available ? `Another shop already has ${current.address}. Try another name.` : "");

  const keep = async (value: string, which: string) => {
    setBusy(which); setError("");
    try {
      await save({ freeName: value });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <span>Free address: <strong style={{ overflowWrap: "anywhere" }}>{address}</strong></span>
        {inSetup && !editing && (
          <button type="button" className="rp-link" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--rp-text)", textDecoration: "underline", font: "inherit" }}
            onClick={() => { setEditing(true); setDraft(press.freeName ?? ""); setError(""); }}>Change name</button>
        )}
      </p>
      {press.freeNameNeeded && <p className="rp-hint" style={{ margin: 0 }}>Your brand name can't be used here. Pick a name.</p>}
      {editing && (
        <form onSubmit={(e) => { e.preventDefault(); if (name && !busy) void keep(draft.trim(), "name"); }} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <TextField label="New name" value={draft} placeholder="moth-books" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            hint={refusal ? undefined : name ? `${name}.${shopDomain}${current?.available ? " is free" : ""}` : "Letters, numbers and dashes."}
            error={refusal || undefined} onChange={(e) => setDraft(e.target.value)} />
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} aria-label="Free names">
              <span className="rp-hint">Free:</span>
              {suggestions.map((s) => <GhostButton key={s} size="sm" disabled={!!busy} onClick={() => setDraft(s)}>{s}</GhostButton>)}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <PrimaryButton type="submit" size="sm" busy={busy === "name"} disabled={!name || !!busy || !!refusal}>Use this name</PrimaryButton>
            {press.freeName && <GhostButton size="sm" busy={busy === "press"} disabled={!!busy} onClick={() => void keep("", "press")}>Use my brand name</GhostButton>}
            {!press.freeNameNeeded && <GhostButton size="sm" disabled={!!busy} onClick={() => { setEditing(false); setError(""); }}>Cancel</GhostButton>}
          </div>
        </form>
      )}
      {error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
    </div>
  );
}

type Choice = "own" | "buy" | "free";
const CHOICES: Array<{ id: Choice; title: string; line: string }> = [
  { id: "own", title: "I already have a domain", line: "Your old site stays up until you connect it." },
  { id: "buy", title: "I need a domain", line: "Buy one at GoDaddy, then add it here." },
  { id: "free", title: "Use the free address for now", line: "Add your own domain any time." },
];

type CardProps = { press: SetupPress; door: Pick<SetupDoor, "saveDomain"> & Partial<Pick<SetupDoor, "checkFreeName">>; save: (c: SetupChange) => Promise<SetupPress>; onSaved: (p: SetupPress) => void };

export function WebAddressCard(props: CardProps) {
  return <div id={WEB_ADDRESS_ANCHOR} style={{ scrollMarginTop: 16 }}><WebAddressInner {...props} /></div>;
}

function WebAddressInner({ press, door, save, onSaved }: CardProps) {
  const toast = useRisoToast();
  const inSetup = press.status === "setup";
  const [picked, setPicked] = useState<Choice | "">(press.domainChoice || "");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(!press.domain);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const choose = async (choice: Choice) => {
    setPicked(choice); setError("");
    // "I already have one" is saved with the domain itself; the other two are answers on their own.
    if (choice === "own" || choice === press.domainChoice) return;
    setBusy(choice);
    try { await save({ domainChoice: choice }); } catch (err) { setError(err instanceof Error ? err.message : "That didn't save. Try again."); } finally { setBusy(""); }
  };

  const keep = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy("keep"); setError("");
    try {
      const saved = await door.saveDomain(press.pressId, draft.trim());
      onSaved(saved);
      setDraft(""); setEditing(false); setPicked("own");
      toast(`Saved. We connect ${saved.domain} once your shop is made.`, { tone: "ok" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  };

  const takeOff = async () => {
    setBusy("remove"); setError("");
    try {
      onSaved(await door.saveDomain(press.pressId, ""));
      setPicked(""); setEditing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy("");
    }
  };

  const field = (label: string): ReactNode => (
    <form onSubmit={keep} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <TextField label={label} value={draft} placeholder="yourpress.com" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        hint="Like yourpress.com" onChange={(e) => setDraft(e.target.value)} disabled={!inSetup} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <PrimaryButton type="submit" busy={busy === "keep"} disabled={!draft.trim() || !!busy || !inSetup}>Use this domain</PrimaryButton>
        {press.domain && <GhostButton onClick={() => { setEditing(false); setDraft(""); setError(""); }}>Keep {press.domain}</GhostButton>}
      </div>
    </form>
  );

  const errorLine = error && <p role="alert" className="rp-hint" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>;

  // A domain is kept: what happens next, and the one change a press may want.
  if (press.domain && !editing) {
    const partner = partnerOf(press.domain);
    return (
      <SectionCard title="Your web address" collapsible={false}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 12, alignItems: "start", padding: 14, border: "2px solid var(--rp-text)", background: "var(--rp-primary-tint)" }}>
            <span aria-hidden style={{ display: "inline-flex", paddingTop: 2 }}><Globe size={22} /></span>
            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <strong style={{ overflowWrap: "anywhere", fontSize: 18 }}>{press.domain}</strong>
              <span>{domainPlan(press)}</span>
              <span className="rp-hint">
                {`Becomes your main address once it works${partner ? `; ${partner} opens it too` : ""}.`}
              </span>
            </div>
          </div>
          {errorLine}
          {inSetup && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <GhostButton size="sm" onClick={() => { setEditing(true); setError(""); }}>Use another domain</GhostButton>
              <GhostButton size="sm" busy={busy === "remove"} disabled={!!busy} onClick={() => void takeOff()}>Don't use a domain yet</GhostButton>
            </div>
          )}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Your web address" collapsible={false}>
      <div style={{ display: "grid", gap: 16 }}>
        {press.freeAddress && <FreeAddressLine press={press} save={save} check={door.checkFreeName} inSetup={inSetup} />}
        <div role="radiogroup" aria-label="Your web address" style={{ display: "grid", gap: 8 }}>
          {CHOICES.map((c) => {
            const on = picked === c.id;
            return (
              <button key={c.id} type="button" role="radio" aria-checked={on} disabled={!!busy || !inSetup} onClick={() => void choose(c.id)}
                style={{ display: "grid", gap: 2, textAlign: "left", minHeight: 56, padding: 14, cursor: "pointer", color: "var(--rp-text)",
                  background: on ? "var(--rp-primary-tint)" : "var(--rp-surface)", border: on ? "2px solid var(--rp-text)" : "1px solid var(--rp-border)" }}>
                <strong>{c.title}</strong>
                <span className="rp-hint">{c.line}</span>
              </button>
            );
          })}
        </div>
        {picked === "own" && field("Your domain")}
        {picked === "buy" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 8 }}>
              <a className="rp-btn rp-btn-primary" href={buyDomainUrl(press.pressName, press.country)} target="_blank" rel="noopener noreferrer" style={{ justifySelf: "start", display: "inline-flex", gap: 8, alignItems: "center" }}>
                <BrandLogo id="godaddy" size="sm" />Find a domain at GoDaddy <ExternalLink size={16} aria-hidden />
              </a>
              {endingHint(press.country) && <span className="rp-hint">{endingHint(press.country)}</span>}
            </div>
            {field("Bought it? Add it here")}
          </div>
        )}
        {errorLine}
      </div>
    </SectionCard>
  );
}
