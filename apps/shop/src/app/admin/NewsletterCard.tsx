// Customers › Newsletter: write a newsletter, send yourself a test, then send it to everyone who confirmed they want
// your news. The server sends it a page at a time (functions/newsletterSend.js); this card shows how far it got.
import React, { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { draftProblem, isActiveIssue, NEWSLETTER_STATUS, reachedText, type NewsletterIssue } from "./newsletterIssues";
import {
  DataTable, Dialog, EmptyState, GhostButton, PrimaryButton, SecondaryButton, SectionCard, SelectField, StatusBadge, TextArea, TextField,
  useConfirm, type Column,
} from "./riso/components";

const EMPTY = { subject: "", body: "", buttonText: "", buttonUrl: "" };
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

export function NewsletterCard() {
  const [ask, confirmNode] = useConfirm();
  const [issues, setIssues] = useState<NewsletterIssue[] | null>(null);
  const [audience, setAudience] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [to, setTo] = useState<"list" | "buyers" | "everyone">("list");
  const [reach, setReach] = useState<number | null>(null);

  const load = useCallback(() => {
    adminApi.listNewsletterIssues().then((rows) => { setIssues(rows); setLoadFailed(false); }).catch(() => setLoadFailed(true));
    adminApi.newsletterAdmin("audience").then((r) => setAudience(r.audience ?? 0)).catch(() => setAudience(null));
  }, []);
  useEffect(() => { load(); }, [load]);
  // How many the chosen group reaches (the list's count is the card's own).
  useEffect(() => {
    if (to === "list") { setReach(audience); return; }
    setReach(null);
    let live = true;
    adminApi.newsletterAdmin("audience", { to }).then((r) => { if (live) setReach(r.audience ?? 0); }).catch(() => { if (live) setReach(null); });
    return () => { live = false; };
  }, [to, audience]);

  // While one is sending, check its progress every 30 seconds.
  const sending = (issues || []).some(isActiveIssue);
  useEffect(() => {
    if (!sending) return;
    const timer = window.setInterval(() => adminApi.listNewsletterIssues().then(setIssues).catch(() => {}), 30000);
    return () => window.clearInterval(timer);
  }, [sending]);

  const problem = draftProblem(draft);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const sendTest = async () => {
    setBusy("test");
    try {
      const r = await adminApi.newsletterAdmin("test", draft);
      toast.success(`Test sent to ${r.to}. Check your inbox.`);
    } catch (e: any) { toast.error(e?.message || "The test couldn't be sent."); }
    finally { setBusy(""); }
  };

  const sendAll = async () => {
    const people = reach ?? 0;
    const yes = await ask({
      title: `Send to ${people} ${people === 1 ? "person" : "people"}?`,
      message: "Once it starts, it can't be taken back from inboxes it has reached. You can cancel the rest while it's sending.",
      confirmLabel: "Send newsletter",
    });
    if (!yes) return;
    setBusy("send");
    try {
      const r = await adminApi.newsletterAdmin("send", { ...draft, to });
      await adminApi.recordAuditLog("customers", `Sent newsletter: ${draft.subject}`).catch(() => {});
      toast.success(`Sending to ${r.audience} ${r.audience === 1 ? "person" : "people"}. It starts within 15 minutes.`);
      setOpen(false);
      setDraft(EMPTY);
      load();
    } catch (e: any) { toast.error(e?.message || "The newsletter couldn't be sent."); }
    finally { setBusy(""); }
  };

  const change = async (issue: NewsletterIssue, op: "cancel" | "resume") => {
    if (op === "cancel" && !(await ask({ title: "Stop sending this newsletter?", message: "People who already got it keep it. Nobody else will get it.", confirmLabel: "Stop sending" }))) return;
    try {
      await adminApi.newsletterAdmin(op, { id: issue.id });
      toast.success(op === "cancel" ? "Stopped. Nobody else will get it." : "Resumed. Sending picks up where it stopped.");
      load();
    } catch (e: any) { toast.error(e?.message || "That didn't work. Try again."); }
  };

  const columns: Column<NewsletterIssue>[] = [
    { key: "subject", header: "Subject", render: (i) => (
      <div>
        <div>{i.subject}</div>
        {i.lastError && i.status !== "sent" && <div className="rp-hint">{i.lastError}</div>}
      </div>
    ) },
    { key: "status", header: "Status", render: (i) => <span style={{ whiteSpace: "nowrap" }}><StatusBadge tone={NEWSLETTER_STATUS[i.status]?.tone || "neutral"}>{NEWSLETTER_STATUS[i.status]?.label || i.status}</StatusBadge></span> },
    { key: "reached", header: "Reached", render: (i) => reachedText(i) },
    { key: "date", header: "Date", render: (i) => <span style={{ whiteSpace: "nowrap" }}>{when(i.finishedAt || i.createdAt)}</span> },
    { key: "act", header: "", render: (i) => isActiveIssue(i) || i.status === "paused" ? (
      <span style={{ display: "inline-flex", gap: 8 }}>
        {i.status === "paused" && <SecondaryButton onClick={() => change(i, "resume")}>Resume</SecondaryButton>}
        <GhostButton onClick={() => change(i, "cancel")}>Stop</GhostButton>
      </span>
    ) : null },
  ];

  const description = sending
    ? "A newsletter is going out now. You can write the next one when it has finished."
    : audience === null
      ? "Write to everyone who signed up for your news."
      : `${audience} ${audience === 1 ? "person has" : "people have"} confirmed they want your news. Everyone gets an unsubscribe link.`;

  return (
    <SectionCard title="Newsletter" description={description} foldKey="customers-newsletter"
      actions={<PrimaryButton icon={<Mail size={16} aria-hidden />} onClick={() => setOpen(true)} disabled={sending}>Write a newsletter</PrimaryButton>}>
      {loadFailed
        ? <EmptyState inline title="Past newsletters couldn't be loaded" action={<SecondaryButton onClick={load}>Try again</SecondaryButton>} />
        : issues && issues.length === 0
          ? <EmptyState inline title="No newsletters sent yet" description="Announce something new, a sale or an event. People join your list from the sign-up box on your shop." />
          : issues && <DataTable caption="Newsletters" columns={columns} rows={issues} rowKey={(i) => i.id} stackOnPhone />}

      <Dialog open={open} onClose={() => !busy && setOpen(false)} title="Write a newsletter" size="lg"
        description="Plain words work best. Your shop's logo and colours frame it, and an unsubscribe link is added at the bottom."
        footer={<>
          <SecondaryButton onClick={() => setOpen(false)} disabled={!!busy}>Cancel</SecondaryButton>
          <SecondaryButton onClick={sendTest} disabled={!!problem || !!busy}>{busy === "test" ? "Sending test…" : "Send me a test"}</SecondaryButton>
          <PrimaryButton onClick={sendAll} disabled={!!problem || !!busy || !reach}>
            {busy === "send" ? "Starting…" : `Send to ${reach ?? 0} ${reach === 1 ? "person" : "people"}`}
          </PrimaryButton>
        </>}>
        <div className="rp-stack">
          <SelectField label="Send to" value={to} onChange={(e) => setTo(e.target.value as typeof to)}
            hint={to === "list" ? undefined : "People who bought in the last two years. Anyone who unsubscribed is left out."}>
            <option value="list">Your mailing list</option>
            <option value="buyers">Past buyers</option>
            <option value="everyone">Mailing list and past buyers</option>
          </SelectField>
          <TextField label="Subject" value={draft.subject} onChange={set("subject")} maxLength={150} placeholder="New this month, and where to find us" />
          <TextArea label="Message" value={draft.body} onChange={set("body")} rows={12} maxLength={20000}
            hint="Leave a blank line between paragraphs. {{shop_name}} becomes your shop's name." />
          <TextField label="Button words (optional)" value={draft.buttonText} onChange={set("buttonText")} maxLength={40} placeholder="See what's new" />
          <TextField label="Button opens (optional)" value={draft.buttonUrl} onChange={set("buttonUrl")} placeholder="https://" inputMode="url" />
          {problem && (draft.subject || draft.body || draft.buttonText || draft.buttonUrl) && <p className="rp-hint" role="status">{problem}</p>}
          {reach === 0 && to === "list" && <p className="rp-hint" role="status">Nobody has confirmed yet, so there is no one to send to. You can still send yourself a test.</p>}
        </div>
      </Dialog>
      {confirmNode}
    </SectionCard>
  );
}
