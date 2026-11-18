import type { ReactNode } from "react";
import { PrimaryButton, SecondaryButton, SelectField, TextField } from "./riso/components";
import { safeLogoUrl } from "./emailTheme";
import { initialOf, senderHealth, type DeliveryRow, type SendMethod } from "./emailSenderView";
import type { Sender } from "./senderSettings";

type Brand = { logoUrl?: string; brandColor?: string; emailTheme?: string };

const METHOD_TITLE: Record<SendMethod, string> = {
  platform: "Sending from Colophon's address",
  gmail: "Sending from your Gmail",
  backup: "Sending from your mail service",
};

/**
 * Settings › Email sender › Sending setup (design handoff 1b): how sending is going, where emails come from, the name and
 * reply address, the email look, and exactly what a shopper sees in their inbox. The "Send from" rows show the address in
 * use; the others lead to the page that sets them up (Settings › Google, Your web address).
 */
export function EmailSendingSetup(p: {
  method: SendMethod; shared: boolean; gmailAddress: string; deliveries: DeliveryRow[] | null;
  sender: Sender; setSender: (next: Sender) => void; senderIssues: Partial<Record<keyof Sender, string>>; shopNameDefault: string;
  senderDirty: boolean; savingSender: boolean; senderReady: boolean; senderError: string; onSaveSender: () => void;
  brand: Brand; onBrand: (field: "logoUrl" | "brandColor" | "emailTheme", value: string) => void; badColor: boolean;
  lookDirty: boolean; savingLook: boolean; onSaveLook: () => void;
  subjectSample: string;
  testEmail: string; setTestEmail: (v: string) => void; sendingTest: boolean; testResult: { ok: boolean; message: string } | null; onSendTest: () => void;
  /** Shops on their own accounts: the Gmail app password card and the backup mail service settings. */
  gmailCard?: ReactNode; backup?: ReactNode;
}) {
  const health = senderHealth(p.deliveries || []);
  const name = p.sender.fromName.trim() || p.shopNameDefault;
  const replyTo = p.sender.replyTo.trim();
  const fromLine = p.method === "gmail" ? (p.gmailAddress || "your Gmail address")
    : p.method === "platform" ? "via Colophon's sending address"
    : (p.sender.fromEmail.trim() || "your mail service address");
  const go = (hash: string) => { window.location.hash = hash; };
  const rows: Array<{ id: string; on: boolean; name: string; sub: string; action?: ReactNode }> = p.shared ? [
    { id: "platform", on: p.method === "platform", name: "Colophon's address", sub: "Nothing to set up" },
    { id: "gmail", on: p.method === "gmail", name: "Your Gmail", sub: p.method === "gmail" && p.gmailAddress ? p.gmailAddress : "Replies land in your inbox",
      action: p.method === "gmail" ? undefined : <PrimaryButton size="sm" onClick={() => go("#settings/google")}>Connect Google</PrimaryButton> },
    { id: "domain", on: false, name: "Your own web address", sub: "orders@ your own address · about 10 minutes",
      action: <SecondaryButton size="sm" className="es-outline" onClick={() => go("#settings/general/details")}>Set up</SecondaryButton> },
  ] : [
    { id: "gmail", on: p.method === "gmail", name: "Your Gmail", sub: p.gmailAddress || "Connect it with an app password below" },
    { id: "backup", on: p.method === "backup", name: "Backup mail service", sub: "Used when Gmail can't send" },
  ];

  return (
    <div className="es-stack">
      <section className="es-banner" data-tone={health.tone} aria-label="Sending status">
        <div>
          <p className="es-kicker">Status</p>
          <h3 className="es-banner-title">{METHOD_TITLE[p.method]}</h3>
        </div>
        <div className="es-banner-side" role="status">
          <div style={{ fontWeight: 600 }}>{p.deliveries === null ? "Checking…" : health.title}</div>
          <div>{p.deliveries === null ? "" : health.line}</div>
        </div>
      </section>

      <div className="es-setup">
        <div className="es-col">
          <section className="es-card" aria-labelledby="es-from-title">
            <div className="es-card-head"><h3 className="es-card-title" id="es-from-title">Send from</h3></div>
            <ul className="es-methods">
              {rows.map((r) => (
                <li key={r.id} className="es-method" data-on={r.on || undefined}>
                  <span className="es-radio" aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <p className="es-method-name">{r.name}{r.on && <span className="rp-sr-only"> (in use)</span>}</p>
                    <p className="es-method-sub">{r.sub}</p>
                  </div>
                  {r.on ? <span className="es-inuse" aria-hidden="true">In use</span> : r.action || <span />}
                </li>
              ))}
            </ul>
          </section>

          {p.gmailCard}

          <section className="es-card" aria-labelledby="es-name-title" id="email-sender" style={{ scrollMarginTop: 16 }}>
            <div className="es-card-head"><h3 className="es-card-title" id="es-name-title">Name and replies</h3></div>
            <div className="es-two">
              <TextField label="Sender name" value={p.sender.fromName} placeholder={p.shopNameDefault} error={p.senderIssues.fromName}
                onChange={(e) => p.setSender({ ...p.sender, fromName: e.target.value })} />
              <TextField label="Replies go to" type="email" value={p.sender.replyTo} placeholder="you@yourpress.example" error={p.senderIssues.replyTo}
                hint="Blank = the sending address." onChange={(e) => p.setSender({ ...p.sender, replyTo: e.target.value })} />
              {!p.shared && (
                <TextField label="Backup sender address" type="email" value={p.sender.fromEmail} placeholder="orders@yourpress.example" error={p.senderIssues.fromEmail}
                  hint="Only for the backup mail service." onChange={(e) => p.setSender({ ...p.sender, fromEmail: e.target.value })} />
              )}
            </div>
            {p.senderError && <p className="rp-error-text" role="alert" style={{ margin: "10px 0 0" }}>{p.senderError}</p>}
            <div style={{ marginTop: 14 }}>
              <PrimaryButton onClick={p.onSaveSender} disabled={p.savingSender || !p.senderReady || !p.senderDirty || Object.keys(p.senderIssues).length > 0}>
                {p.savingSender ? "Saving…" : p.senderDirty ? "Save" : "Saved"}
              </PrimaryButton>
            </div>
          </section>

          <section className="es-card" aria-labelledby="es-look-title">
            <div className="es-card-head"><h3 className="es-card-title" id="es-look-title">Email look</h3><p className="es-hint">One look for every email.</p></div>
            <div className="es-two">
              <TextField label="Logo address" value={p.brand.logoUrl || ""} placeholder="https://yourpress.example/logo.png"
                error={p.brand.logoUrl && !safeLogoUrl(p.brand.logoUrl) ? "Use an https:// picture address. Others are left out of emails." : undefined}
                onChange={(e) => p.onBrand("logoUrl", e.target.value)} />
              <div className="rp-field" style={{ margin: 0 }}>
                <label className="rp-label" htmlFor="brand-color">Accent colour</label>
                <div className="es-colour">
                  <input id="brand-color-pick" type="color" aria-label="Pick the accent colour" value={/^#[0-9a-f]{6}$/i.test(p.brand.brandColor || "") ? p.brand.brandColor : "#a9e8c6"} onChange={(e) => p.onBrand("brandColor", e.target.value)} />
                  <input id="brand-color" className="rp-input rp-mono" value={p.brand.brandColor || ""} placeholder="#a9e8c6" aria-invalid={p.badColor || undefined}
                    onChange={(e) => p.onBrand("brandColor", e.target.value)} />
                </div>
                {p.badColor && <p className="rp-error-text" role="alert" style={{ margin: "6px 0 0" }}>Use a colour code like #a9e8c6. Until then emails use mint.</p>}
              </div>
              <SelectField label="Email theme" value={["dark", "market", "index"].includes(String(p.brand.emailTheme)) ? String(p.brand.emailTheme) : "light"}
                onChange={(e) => p.onBrand("emailTheme", e.target.value)}>
                <option value="light">Light (cream)</option>
                <option value="dark">Dark (night)</option>
                <option value="market">Market stall (yellow)</option>
                <option value="index">Index rows (grey and black)</option>
              </SelectField>
            </div>
            {p.backup}
            <div style={{ marginTop: 14 }}>
              <PrimaryButton onClick={p.onSaveLook} disabled={p.savingLook || !p.lookDirty}>{p.savingLook ? "Saving…" : p.lookDirty ? "Save look" : "Saved"}</PrimaryButton>
            </div>
          </section>
        </div>

        <div className="es-col">
          <section className="es-card" aria-labelledby="es-see-title">
            <div className="es-card-head"><h3 className="es-card-title" id="es-see-title">What shoppers see</h3></div>
            <div className="es-inbox">
              <span className="es-avatar" aria-hidden="true">{initialOf(name)}</span>
              <div style={{ minWidth: 0 }}>
                <p className="es-inbox-name">{name}</p>
                <p className="es-inbox-from">{fromLine}</p>
                <p className="es-inbox-subject">{p.subjectSample}</p>
              </div>
            </div>
            <p className="es-hint" style={{ marginTop: 12 }}>Replies go to {replyTo || (p.method === "gmail" && p.gmailAddress ? p.gmailAddress : "your shop email")}</p>
          </section>

          <section className="es-card" aria-labelledby="es-test-title" id="notif-send-test">
            <div className="es-card-head"><h3 className="es-card-title" id="es-test-title">Send a test</h3></div>
            <form className="es-row" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); p.onSendTest(); }}>
              <div className="es-grow" style={{ minWidth: 180 }}>
                <TextField label="Send to" type="email" value={p.testEmail} placeholder="you@yourpress.example" onChange={(e) => p.setTestEmail(e.target.value)} />
              </div>
              <SecondaryButton type="submit" className="es-outline" disabled={p.sendingTest}>{p.sendingTest ? "Sending…" : "Send"}</SecondaryButton>
            </form>
            {p.testResult
              ? <p className="es-note" data-tone={p.testResult.ok ? "good" : "problem"} role="status" style={{ marginTop: 12 }}>{p.testResult.message}</p>
              : <p className="es-hint" style={{ marginTop: 10 }}>Sends the Order Paid email with sample order details.</p>}
          </section>

          {p.shared && p.method !== "gmail" && (
            <aside className="es-info" aria-labelledby="es-why-title">
              <h3 className="es-card-title" id="es-why-title">Why connect Gmail?</h3>
              <p>Emails come from your name and address, so they're less likely to land in spam.</p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
