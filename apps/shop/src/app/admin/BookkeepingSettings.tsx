import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { ErrorState, LoadingState, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextField, useConfirm } from "./riso/components";
import {
  ACCOUNT_PARTS, CONNECT_LABEL, STYLE_CHOICES, bookkeepingError, connectOutcome, currentStep, endsText, firstMatches, lastSentText, saveProblem,
  shopTaxNames, yesterday, type AccountPart, type BookkeepingOptions, type BookkeepingStatus, type BookkeepingStyle,
} from "./quickbooksLink";

type Props = {
  taxRates: { country?: string; region?: string; rate?: string; bookName?: string }[];
  /** Where Intuit's sign-in page is opened; the page leaves the admin and comes back with `?quickbooks=`. */
  openSignIn?: (url: string) => void;
};

// Settings › Bookkeeping (plan 7.16): Connect to QuickBooks in three steps (sign in with Intuit, one line per day or
// every order, match taxes), then the last day sent, Send again for a day, and Disconnect. Shown only when the
// platform's bookkeeping link is on for this shop (status.enabled); otherwise nothing renders.
export function BookkeepingSettings({ taxRates, openSignIn = (url) => window.location.assign(url) }: Props) {
  const [status, setStatus] = useState<BookkeepingStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>("load");
  const [stage, setStage] = useState<2 | 3 | null>(null);
  const [style, setStyle] = useState<BookkeepingStyle>("daily");
  const [options, setOptions] = useState<BookkeepingOptions | null>(null);
  const [taxCodes, setTaxCodes] = useState<Record<string, string>>({});
  const [noTaxCode, setNoTaxCode] = useState("");
  const [accounts, setAccounts] = useState<Partial<Record<AccountPart, string>>>({});
  const [resendDay, setResendDay] = useState(yesterday());
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReturnType<typeof connectOutcome>>(null);
  const [confirm, confirmNode] = useConfirm();

  const names = shopTaxNames(taxRates, status?.taxCodes);

  const load = async () => {
    setBusy("load");
    setLoadError(null);
    try {
      const found = await adminApi.bookkeeping("status");
      setStatus(found);
      if (found.style) setStyle(found.style);
    } catch (err) {
      setLoadError(bookkeepingError(err, "load your bookkeeping link"));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    // Back from Intuit's sign-in: say how it went, then take the word off the address.
    const params = new URLSearchParams(window.location.search);
    const back = params.get("quickbooks");
    if (back) {
      setOutcome(connectOutcome(back));
      params.delete("quickbooks");
      const rest = params.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (what: string, label: string, work: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try { await work(); } catch (err) { setError(bookkeepingError(err, label)); } finally { setBusy(null); }
  };

  const connect = () => run("connect", "open QuickBooks's sign-in", async () => {
    const back = `${window.location.origin}${window.location.pathname}#settings/bookkeeping`;
    const { url } = await adminApi.bookkeeping("connect", { returnUrl: back });
    if (url) openSignIn(url);
  });

  const toStep3 = () => run("options", "read your QuickBooks tax codes and accounts", async () => {
    const found = await adminApi.bookkeeping("options");
    setOptions(found);
    setTaxCodes(firstMatches(names, found.taxCodes, status?.taxCodes));
    setNoTaxCode(status?.noTaxCode && found.taxCodes.some((c) => c.id === status.noTaxCode) ? status.noTaxCode : found.taxCodes.find((c) => /exempt|zero/i.test(c.name))?.id ?? "");
    setAccounts(Object.fromEntries(ACCOUNT_PARTS.map((p) => [p.id, found.suggested?.[p.id] ?? ""]).filter(([, id]) => id)));
    setStage(3);
  });

  const draft = { style, taxCodes, noTaxCode, accounts };
  const problem = saveProblem(names, draft);
  const save = () => run("save", "save your QuickBooks choices", async () => {
    const saved = await adminApi.bookkeeping("save", { style, taxCodes, noTaxCode, accounts: accounts as Record<AccountPart, string> });
    setStatus(saved);
    setStage(null);
    setOutcome({ tone: "success", text: "All set. Each night, the day before is sent to QuickBooks." });
  });

  const resend = () => run("resend", `send ${resendDay} again`, async () => {
    const answer = await adminApi.bookkeeping("resend", { date: resendDay });
    const result = answer.results?.[0];
    setResendNote(answer.stopped === "disconnected" ? "QuickBooks stopped taking this shop's sales. Connect to QuickBooks again."
      : !result || result.outcome === "empty" ? "There were no sales that day."
        : result.outcome === "already" ? "That day is already in QuickBooks. Nothing was sent twice."
          : result.outcome === "sent" ? "Sent to QuickBooks."
            : result.message || "That day couldn't be sent.");
    await load();
  });

  const disconnect = async () => {
    const ok = await confirm({ title: "Disconnect QuickBooks?", message: "Nothing more is sent to QuickBooks. What's already there stays. You can connect again later.", confirmLabel: "Disconnect" });
    if (ok) await run("disconnect", "disconnect QuickBooks", async () => { setStatus(await adminApi.bookkeeping("disconnect")); setStage(null); });
  };

  if (busy === "load" && !status) return <LoadingState label="Loading your bookkeeping link…" />;
  if (loadError && !status) return <ErrorState title="Couldn't load Bookkeeping" description={loadError} onRetry={load} />;
  if (!status?.enabled) return null;

  const step = currentStep(status, stage);
  const codeOptions = options?.taxCodes ?? [];

  return (
    <div className="rp-stack" style={{ gap: 24 }}>
      {outcome && <p role="status" className="rp-hint" style={{ margin: 0 }}><StatusBadge tone={outcome.tone}>{outcome.tone === "success" ? "Done" : "Not connected"}</StatusBadge> {outcome.text}</p>}

      {step === 1 && (
        <SectionCard title="QuickBooks" description="Send your sales to QuickBooks each night.">
          <div className="rp-stack" style={{ gap: 12 }}>
            <p className="rp-hint" style={{ margin: 0 }}>Step 1 of 3: sign in with Intuit and choose your QuickBooks company.</p>
            {status.problem === "lost" && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)" }}>QuickBooks stopped taking this shop's sales. Connect again; the days you missed are sent after.</p>}
            {status.mode === "test" && <p className="rp-hint" style={{ margin: 0 }}>Your shop is in test mode, so this connects a QuickBooks test company.</p>}
            <div className="rp-card-actions">
              <PrimaryButton disabled={!!busy} onClick={connect}>{busy === "connect" ? "Opening…" : CONNECT_LABEL}</PrimaryButton>
            </div>
          </div>
        </SectionCard>
      )}

      {step === 2 && (
        <SectionCard title="How sales are sent" description="Step 2 of 3. You can change this later.">
          <div className="rp-stack" style={{ gap: 12 }}>
            {status.companyName && <p className="rp-hint" style={{ margin: 0 }}>Connected to <strong>{status.companyName}</strong>.</p>}
            <fieldset className="rp-wb-templates">
              <legend className="rp-label">Send to QuickBooks as</legend>
              {STYLE_CHOICES.map((choice) => (
                <label key={choice.id}>
                  <input type="radio" name="bookkeeping-style" checked={style === choice.id} onChange={() => setStyle(choice.id)} />
                  <span><strong>{choice.label}</strong><span className="rp-hint" style={{ display: "block" }}>{choice.hint}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="rp-card-actions">
              <PrimaryButton disabled={!!busy} onClick={toStep3}>{busy === "options" ? "Reading QuickBooks…" : "Continue"}</PrimaryButton>
              {status.ready && <SecondaryButton disabled={!!busy} onClick={() => setStage(null)}>Cancel</SecondaryButton>}
            </div>
          </div>
        </SectionCard>
      )}

      {step === 3 && options && (
        <SectionCard title="Match taxes" description="Step 3 of 3. Each tax once; we chose likely accounts.">
          <div className="rp-stack" style={{ gap: 12 }}>
            {names.length === 0 && <p className="rp-hint" style={{ margin: 0 }}>Your shop charges no tax yet. Add rates in Settings › Taxes, then match them here.</p>}
            {names.map((name) => (
              <SelectField key={name} label={`${name} is`} value={taxCodes[name] ?? ""} onChange={(e) => setTaxCodes((c) => ({ ...c, [name]: e.target.value }))}>
                <option value="">Choose a QuickBooks tax code</option>
                {codeOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            ))}
            <SelectField label="Sales with no tax" hint="Gift cards and untaxed sales use this code." value={noTaxCode} onChange={(e) => setNoTaxCode(e.target.value)}>
              <option value="">Choose a QuickBooks tax code</option>
              {codeOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
            {ACCOUNT_PARTS.map((part) => (
              <SelectField key={part.id} label={part.label} hint={part.hint} value={accounts[part.id] ?? ""} onChange={(e) => setAccounts((a) => ({ ...a, [part.id]: e.target.value }))}>
                <option value="">Choose an account</option>
                {(options.accounts[part.id] ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectField>
            ))}
            {problem && <p className="rp-hint" style={{ margin: 0 }}>{problem}</p>}
            <div className="rp-card-actions">
              <PrimaryButton disabled={!!busy || !!problem} onClick={save}>{busy === "save" ? "Saving…" : "Save and start sending"}</PrimaryButton>
              <SecondaryButton disabled={!!busy} onClick={() => setStage(2)}>Back</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      )}

      {step === "done" && (
        <SectionCard title="QuickBooks" description={status.companyName ? `Connected to ${status.companyName}.` : "Connected."}>
          <div className="rp-stack" style={{ gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <StatusBadge tone="success">Connected</StatusBadge>
              <span className="rp-hint">{STYLE_CHOICES.find((c) => c.id === status.style)?.label}</span>
            </div>
            <p style={{ margin: 0 }}>{lastSentText(status.lastSent)}</p>
            {status.endsSoon && <p role="alert" style={{ margin: 0, color: "var(--rp-warning)" }}>{endsText(status.endsAt)}</p>}
            <div className="rp-stack" style={{ gap: 8 }}>
              <TextField label="Send a day again" type="date" value={resendDay} max={yesterday()} hint="Only sends what QuickBooks doesn't have already."
                onChange={(e) => { setResendDay(e.target.value); setResendNote(null); }} />
              <div className="rp-card-actions">
                <SecondaryButton disabled={!!busy || !resendDay} onClick={resend}>{busy === "resend" ? "Sending…" : "Send again"}</SecondaryButton>
              </div>
              {resendNote && <p role="status" className="rp-hint" style={{ margin: 0 }}>{resendNote}</p>}
            </div>
            <div className="rp-card-actions">
              <SecondaryButton disabled={!!busy} onClick={() => setStage(2)}>Change choices</SecondaryButton>
              {status.endsSoon && <PrimaryButton disabled={!!busy} onClick={connect}>{CONNECT_LABEL}</PrimaryButton>}
              <SecondaryButton disabled={!!busy} onClick={disconnect}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</SecondaryButton>
            </div>
          </div>
        </SectionCard>
      )}

      {error && <p role="alert" style={{ margin: 0, color: "var(--rp-danger)" }}>{error}</p>}
      {confirmNode}
    </div>
  );
}
