// Admin › Donations (beta, 18 November 2026; LMB-PLATFORM tasks/todo/2026-11-18-giving-g1.md). Gifts from the website's
// Support page, who gave and what they wrote, and the amounts the page suggests, in the Colophon bento look (bookings.css
// tiles + giving.css, tokens only). Shown only when Donations & tips is on for the shop (both switches, Dashboard.tsx).
// Gifts are server-only records, so every read and change goes through the server (givingApi.ts). The tile of blocked
// tries shows the card-testing guard at work.
import { useEffect, useState } from "react";
import { Check, ExternalLink, FileText, Flag, Gift, HeartHandshake, Mail, Megaphone, Pencil, Play, Plus, Send, Settings2, Square, Trash2, Undo2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, StatusBadge, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { givingAdmin, type AdminFundraiser, type AdminGift, type FundraiserUpdate, type GivingList } from "./givingApi";
import { amountFromText, blankReward, blockedLine, charityFormOf, charityKindText, charityToSave, dayText, fundraiserLines, giverLine, goalFromText, honourText, rewardLine, rewardRowsOf, receiptText, rewardsFromRows, shipToText, updateBusy, updateState, withAmount, type CharityForm, type RewardRow } from "./givingView";
import { moneyText } from "./eventsView";
import { MAX_AMOUNTS, MAX_THANKS, MAX_TIP_CHOICES, cleanTipPercents, type GivingSettings } from "../../shared/givingRules";
import { MAX_REWARDS, MAX_REWARD_TEXT, MAX_REWARD_TITLE, MAX_REWARD_WHEN, MAX_STORY, MAX_TITLE, dayAfter, goalProgress, type FundraiserInput } from "../../shared/fundraiserRules";
import { MAX_CHARITY_ADDRESS, MAX_CHARITY_NAME, MAX_SIGNER, receiptAddressLine, type ReceiptAddress } from "../../shared/charityReceipts";
import { SHOP_CURRENCY } from "./moneySign";
import "./bookings.css";
import "./giving.css";

const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Giving() {
  const [data, setData] = useState<GivingList | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [fundForm, setFundForm] = useState<AdminFundraiser | "new" | null>(null);
  const [updating, setUpdating] = useState<AdminFundraiser | null>(null);
  const [correcting, setCorrecting] = useState<AdminGift | null>(null);

  const reload = () => givingAdmin<GivingList>("list")
    .then((answer) => { setData(answer); setError(""); })
    .catch((err) => setError(problemOf(err, "Your donations didn't load.")));
  useEffect(() => { void reload(); }, []);

  if (error && !data) return <ErrorState title="Your donations didn't load" description={error} onRetry={() => { void reload(); }} />;
  if (!data) return <LoadingState label="Opening your donations…" />;

  const currency = data.currency || SHOP_CURRENCY;
  const money = (minor: number) => moneyText(minor, currency);
  const { totals, blocked } = data;

  return (
    <div className="bkg-page gvg-page">
      <PageActions>
        <SecondaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open("/support", "_blank", "noopener")}>View Support page</SecondaryButton>
        <PrimaryButton icon={<Settings2 size={16} aria-hidden />} onClick={() => setEditing(true)}>Amounts & choices</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Donations & tips is new. Tell us what would make it better from Help.</span>
      </div>

      <section className="bkg-bento gvg-bento" aria-label="At a glance">
        <div className="bkg-tile bkg-tile-mint">
          <p className="bkg-kicker">This month</p>
          <p className="bkg-big bkg-big-money">{money(totals.monthMinor)}</p>
          <p className="bkg-sub gvg-on-tile">given to your shop</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">All time</p>
          <p className="bkg-big bkg-big-money">{money(totals.givenMinor)}</p>
          <p className="bkg-sub">{totals.gifts === 1 ? "from 1 gift" : `from ${totals.gifts} gifts`}</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">Givers</p>
          <p className="bkg-big">{totals.givers}</p>
          <p className="bkg-sub">{totals.givers === 1 ? "person has given" : "people have given"}</p>
        </div>
        <div className="bkg-tile bkg-tile-ink">
          <p className="bkg-kicker">Blocked tries</p>
          <p className="bkg-big">{blocked.total}</p>
          <p className="bkg-sub gvg-on-ink">{blockedLine(blocked)}</p>
        </div>
      </section>

      <p className="gvg-guard">
        To stop people testing stolen cards on your page, the lowest gift is {money(data.minMinor)}, each visitor and each email can open only a few card
        pages an hour, and forms sent by bots are turned away. Gifts carry no sales tax.
      </p>

      <Fundraisers list={data.fundraisers || []} money={money} onEdit={setFundForm} updates={data.updates || {}} onUpdate={setUpdating}
        onChanged={(next, removedId) => setData((d) => d && { ...d, fundraisers: [...(next ? [next] : []), ...(d.fundraisers || []).filter((f) => f.id !== (next?.id || removedId))] })} />

      <h2 className="gvg-section-title">Gifts</h2>
      {data.gifts.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState icon={<HeartHandshake size={24} aria-hidden />} title="No gifts yet"
            description="When someone gives from your Support page, their gift shows here with anything they wrote."
            action={<SecondaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open("/support", "_blank", "noopener")}>View Support page</SecondaryButton>} />
        </div>
      ) : (
        <ul className="gvg-list" aria-label="Gifts">
          {data.gifts.map((gift) => <GiftRow key={gift.id} gift={gift} money={money} onCorrect={setCorrecting} onChanged={(next) => setData((d) => d && { ...d, gifts: d.gifts.map((g) => (g.id === next.id ? next : g)) })} />)}
        </ul>
      )}

      {fundForm && <FundraiserDrawer start={fundForm === "new" ? null : fundForm} today={data.today || new Date().toISOString().slice(0, 10)} money={money}
        running={(data.fundraisers || []).find((f) => f.state === "live") || null} onClose={() => setFundForm(null)}
        onSaved={(next) => { setData((d) => d && { ...d, fundraisers: [next, ...(d.fundraisers || []).filter((f) => f.id !== next.id)] }); setFundForm(null); }} />}

      {updating && <UpdateDrawer fundraiser={updating} updates={data.updates?.[updating.id] || []} onClose={() => setUpdating(null)}
        onChanged={(u) => setData((d) => d && { ...d, updates: { ...(d.updates || {}), [u.fundraiserId]: [u, ...(d.updates?.[u.fundraiserId] || []).filter((x) => x.id !== u.id)] } })} />}

      {correcting && <ReceiptDrawer gift={correcting} kind={data.settings.charity?.kind || "ca"} onClose={() => setCorrecting(null)}
        onSaved={(next) => { setData((d) => d && { ...d, gifts: d.gifts.map((g) => (g.id === next.id ? next : g)) }); setCorrecting(null); }} />}

      {editing && <SettingsDrawer start={data.settings} money={money} onClose={() => setEditing(false)}
        onSaved={(settings) => { setData((d) => d && { ...d, settings }); setEditing(false); }} />}
    </div>
  );
}

function GiftRow({ gift, money, onChanged, onCorrect }: { gift: AdminGift; money: (minor: number) => string; onChanged: (gift: AdminGift) => void; onCorrect?: (gift: AdminGift) => void }) {
  const [busy, setBusy] = useState<"" | "refund" | "resend" | "sent">("");
  const [ask, confirmNode] = useConfirm();
  const refunded = gift.status === "refunded";
  const honour = honourText(gift);

  const refund = async () => {
    if (!(await ask({ title: "Refund this gift?", message: `${money(gift.chargedMinor)} goes back to ${giverLine(gift)}'s card, and they get an email saying so. This can't be undone.`, confirmLabel: "Refund gift" }))) return;
    setBusy("refund");
    try {
      const answer = await givingAdmin<{ gift: AdminGift }>("refund", { giftId: gift.id });
      onChanged(answer.gift);
      toast.success("Refunded.");
    } catch (err) { toast.error(problemOf(err, "The refund didn't go through. Try again.")); }
    finally { setBusy(""); }
  };
  const resend = async () => {
    setBusy("resend");
    try { await givingAdmin("resendThanks", { giftId: gift.id }); toast.success(`Thank-you sent to ${gift.email}.`); }
    catch (err) { toast.error(problemOf(err, "The email didn't go out. Try again.")); }
    finally { setBusy(""); }
  };

  const markSent = async (sent: boolean) => {
    setBusy("sent");
    try {
      const answer = await givingAdmin<{ gift: AdminGift }>("rewardSent", { giftId: gift.id, sent });
      onChanged(answer.gift);
      toast.success(sent ? "Marked as sent." : "Marked as not sent yet.");
    } catch (err) { toast.error(problemOf(err, "That didn't save. Try again.")); }
    finally { setBusy(""); }
  };
  const reward = gift.reward;

  return (
    <li className="bkg-tile gvg-row" data-refunded={refunded || undefined}>
      <div className="gvg-main">
        <div className="gvg-who">
          <strong>{giverLine(gift)}</strong>
          {gift.anonymous && <StatusBadge tone="neutral" glyph={false}>Anonymous</StatusBadge>}
          {refunded && <StatusBadge tone="warning">Refunded</StatusBadge>}
          {gift.test && <StatusBadge tone="info" glyph={false}>Test</StatusBadge>}
          {gift.fundraiserId && <StatusBadge tone="neutral" glyph={false}>Fundraiser</StatusBadge>}
        </div>
        <p className="gvg-meta">{[gift.email, dayText(gift.paidAt || gift.createdAt)].filter(Boolean).join(" · ")}</p>
        {honour && <p className="gvg-honour">{honour}</p>}
        {gift.note && <blockquote className="gvg-note">{gift.note}</blockquote>}
        {receiptText(gift) && (
          <div className="gvg-receipt" data-cancelled={gift.receipt?.status === "cancelled" || undefined}>
            <FileText size={16} aria-hidden />
            <div>
              <p><strong>{receiptText(gift)}</strong></p>
              {gift.receipt && <p className="gvg-meta">{[gift.receipt.name, receiptAddressLine(gift.receipt.address)].filter(Boolean).join(", ")}{gift.receipt.status === "cancelled" && gift.receipt.cancelledOn ? ` · cancelled ${dayText(`${gift.receipt.cancelledOn}T12:00:00Z`)}` : ""}</p>}
            </div>
            {!refunded && gift.receipt?.status === "issued" && onCorrect && <GhostButton icon={<Pencil size={16} aria-hidden />} onClick={() => onCorrect(gift)}>Correct</GhostButton>}
          </div>
        )}
        {reward && (
          <div className="gvg-gift-reward" data-sent={reward.sentAt ? true : undefined}>
            <Gift size={16} aria-hidden />
            <div>
              <p><strong>{reward.title}</strong>{reward.when ? ` · ${reward.when}` : ""}</p>
              {reward.ships && gift.shipTo && <p className="gvg-meta">Post to {shipToText(gift.shipTo)}</p>}
              {reward.sentAt && <p className="gvg-meta">Sent {dayText(reward.sentAt)}</p>}
            </div>
            {!refunded && (reward.sentAt
              ? <GhostButton onClick={() => { void markSent(false); }} busy={busy === "sent"} disabled={!!busy}>Not sent yet</GhostButton>
              : <SecondaryButton icon={<Check size={16} aria-hidden />} onClick={() => { void markSent(true); }} busy={busy === "sent"} disabled={!!busy}>Mark sent</SecondaryButton>)}
          </div>
        )}
      </div>
      <div className="gvg-side">
        <p className="gvg-amount">{money(gift.amountMinor)}{gift.feeMinor > 0 && <small>+ {money(gift.feeMinor)} card fee covered</small>}</p>
        {!refunded && (
          <div className="gvg-actions">
            <GhostButton icon={<Mail size={16} aria-hidden />} onClick={() => { void resend(); }} busy={busy === "resend"} disabled={!!busy}>Send thank-you again</GhostButton>
            <GhostButton icon={<Undo2 size={16} aria-hidden />} onClick={() => { void refund(); }} busy={busy === "refund"} disabled={!!busy}>Refund</GhostButton>
          </div>
        )}
      </div>
      {confirmNode}
    </li>
  );
}

/** The fundraiser running (or drafted) on top, with its bar; past ones below in one line each. */
function Fundraisers({ list, money, onEdit, onChanged, updates, onUpdate }: {
  list: AdminFundraiser[]; money: (minor: number) => string; onEdit: (f: AdminFundraiser | "new") => void; onChanged: (next: AdminFundraiser | null, removedId?: string) => void;
  updates: Record<string, FundraiserUpdate[]>; onUpdate: (f: AdminFundraiser) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const current = list.find((f) => f.state === "live") || list.find((f) => f.state === "draft") || null;
  const past = list.filter((f) => f.state === "ended");
  const end = async (f: AdminFundraiser) => {
    const draft = f.state === "draft";
    if (!(await ask(draft
      ? { title: "Delete this draft?", message: `"${f.title}" was never started, so nothing else changes.`, confirmLabel: "Delete draft" }
      : { title: "End this fundraiser now?", message: `"${f.title}" leaves your Support page and takes no more gifts. What it raised and its supporters are kept. This can't be undone.`, confirmLabel: "End fundraiser" }))) return;
    setBusy(true);
    try {
      const answer = await givingAdmin<{ fundraiser?: AdminFundraiser; removed?: boolean }>("endFundraiser", { id: f.id });
      onChanged(answer.fundraiser || null, f.id);
      toast.success(draft ? "Draft deleted." : "Fundraiser ended.");
    } catch (err) { toast.error(problemOf(err, "That didn't go through. Try again.")); }
    finally { setBusy(false); }
  };

  return (
    <section className="gvg-funds" aria-labelledby="gvg-funds-title">
      <div className="gvg-funds-head">
        <h2 id="gvg-funds-title" className="gvg-section-title">Fundraiser</h2>
        {!current && <SecondaryButton icon={<Flag size={16} aria-hidden />} onClick={() => onEdit("new")}>Start a fundraiser</SecondaryButton>}
      </div>
      {current ? <FundraiserCard f={current} money={money} busy={busy} latest={updates[current.id]?.[0]} onEdit={() => onEdit(current)} onEnd={() => { void end(current); }}
        onUpdate={() => onUpdate(current)} /> : (
        <p className="gvg-hint">A goal, a last day and your story at the top of your Support page, with a bar that fills as gifts come in. One runs at a time.</p>
      )}
      {past.length > 0 && (
        <><h3 className="gvg-past-title">Past fundraisers</h3><ul className="gvg-past" aria-label="Past fundraisers">
          {past.map((f) => <li key={f.id}><strong>{f.title}</strong><span>{fundraiserLines(f, money).raised}</span><span>{f.supporters === 1 ? "1 supporter" : `${f.supporters} supporters`}</span><span>Ended {dayText(f.endedAt || `${f.endsOn}T12:00:00Z`)}</span>
            {f.supporters > 0 && <GhostButton icon={<Megaphone size={16} aria-hidden />} onClick={() => onUpdate(f)}>{updates[f.id]?.length ? "Updates" : "Write an update"}</GhostButton>}</li>)}
        </ul></>
      )}
      {confirmNode}
    </section>
  );
}

function FundraiserCard({ f, money, busy, latest, onEdit, onEnd, onUpdate }: {
  f: AdminFundraiser; money: (minor: number) => string; busy: boolean; latest?: FundraiserUpdate; onEdit: () => void; onEnd: () => void; onUpdate: () => void;
}) {
  const { bar } = goalProgress(f.raisedMinor, f.goalMinor);
  const lines = fundraiserLines(f, money);
  return (
    <div className="bkg-tile gvg-fund" data-state={f.state}>
      <div className="gvg-fund-top">
        <div className="gvg-who">
          <strong>{f.title}</strong>
          <StatusBadge tone={f.state === "live" ? "success" : "neutral"}>{f.state === "live" ? "Running" : "Draft"}</StatusBadge>
        </div>
        <div className="gvg-actions">
          {f.state === "live" && <GhostButton icon={<Megaphone size={16} aria-hidden />} onClick={onUpdate} disabled={busy}>Write an update</GhostButton>}
          <GhostButton icon={<Pencil size={16} aria-hidden />} onClick={onEdit} disabled={busy}>{f.state === "draft" ? "Edit or start" : "Edit"}</GhostButton>
          <GhostButton icon={<Square size={16} aria-hidden />} onClick={onEnd} busy={busy}>{f.state === "draft" ? "Delete draft" : "End now"}</GhostButton>
        </div>
      </div>
      <p className="gvg-fund-raised"><span>{money(f.raisedMinor)}</span> raised of {money(f.goalMinor)}</p>
      <div className="gvg-bar" role="progressbar" aria-label="Toward the goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar}><span style={{ width: `${bar}%` }} /></div>
      <p className="gvg-meta">{[lines.percent, f.supporters === 1 ? "1 supporter" : `${f.supporters} supporters`, lines.when].join(" · ")}</p>
      {f.rewards.length > 0 && (
        <ul className="gvg-fund-rewards" aria-label="Thank-you rewards">
          {f.rewards.map((r) => (
            <li key={r.id} data-gone={r.limit > 0 && r.taken >= r.limit ? true : undefined}>
              <Gift size={14} aria-hidden /><strong>{r.title}</strong><span>{rewardLine(r, money)}</span>
            </li>
          ))}
        </ul>
      )}
      {latest && (
        <button type="button" className="gvg-fund-update" onClick={onUpdate}>
          <Megaphone size={14} aria-hidden /><span>Last update: <strong>{latest.subject}</strong></span>
          <StatusBadge tone={updateState(latest).tone}>{updateState(latest).badge}</StatusBadge>
        </button>
      )}
    </div>
  );
}

/**
 * Donations › Fundraiser › Write an update (G2c): a subject and a message emailed to everyone who gave, once each, by the
 * server a page at a time. A test goes to the owner first; the history below says how each one went.
 */
function UpdateDrawer({ fundraiser, updates, onClose, onChanged }: {
  fundraiser: AdminFundraiser; updates: FundraiserUpdate[]; onClose: () => void; onChanged: (u: FundraiserUpdate) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [busy, setBusy] = useState<"" | "test" | "send" | string>("");
  const [problem, setProblem] = useState<{ field: string; words: string } | null>(null);
  const [ask, confirmNode] = useConfirm();
  const going = updates.find((u) => updateBusy(u));
  useEffect(() => {
    let alive = true;
    givingAdmin<{ audience: number }>("updateCount", { fundraiserId: fundraiser.id })
      .then((a) => { if (alive) setAudience(a.audience); })
      .catch(() => { if (alive) setAudience(-1); });
    return () => { alive = false; };
  }, [fundraiser.id]);
  const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

  const send = async (op: "updateTest" | "updateSend") => {
    if (!subject.trim()) { setProblem({ field: "subject", words: "Give the update a subject line." }); return; }
    if (!body.trim()) { setProblem({ field: "body", words: "Write something in the update before sending it." }); return; }
    if (op === "updateSend" && !(await ask({
      title: `Send this to ${people(audience || 0)}?`,
      message: `Everyone who gave to "${fundraiser.title}" gets it by email in the next few minutes. It can be stopped while it's going out, but not taken back.`,
      confirmLabel: "Send update",
    }))) return;
    setBusy(op === "updateTest" ? "test" : "send");
    try {
      const answer = await givingAdmin<{ to?: string; update?: FundraiserUpdate }>(op, { fundraiserId: fundraiser.id, subject, body });
      if (op === "updateTest") toast.success(`Test sent to ${answer.to}.`);
      else if (answer.update) { onChanged(answer.update); setSubject(""); setBody(""); toast.success("Your update is on its way."); }
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      setProblem({ field: code === "subject" || code === "body" ? code : "", words: problemOf(err, "That didn't go through. Try again.") });
    } finally { setBusy(""); }
  };
  const act = async (u: FundraiserUpdate, op: "updateCancel" | "updateResume") => {
    if (op === "updateCancel" && !(await ask({ title: "Stop this update?", message: `The ${u.sent} people it reached keep it; nobody else gets it.`, confirmLabel: "Stop sending" }))) return;
    setBusy(u.id);
    try {
      const answer = await givingAdmin<{ update: FundraiserUpdate }>(op, { fundraiserId: fundraiser.id, id: u.id });
      onChanged({ ...u, ...answer.update });
    } catch (err) { toast.error(problemOf(err, "That didn't go through. Try again.")); }
    finally { setBusy(""); }
  };
  const blocked = !!going || audience === 0;

  return (
    <Drawer open onClose={onClose} title="Write an update"
      footer={<>
        <GhostButton icon={<Mail size={16} aria-hidden />} onClick={() => { void send("updateTest"); }} busy={busy === "test"} disabled={!!busy && busy !== "test"}>Send me a test</GhostButton>
        <PrimaryButton icon={<Send size={16} aria-hidden />} onClick={() => { void send("updateSend"); }} busy={busy === "send"} disabled={blocked || audience === null || (!!busy && busy !== "send")}>
          {audience && audience > 0 ? `Send to ${people(audience)}` : "Send update"}
        </PrimaryButton>
      </>}>
      <div className="gvg-form">
        <p className="gvg-hint">
          Tell the people who gave to <strong>{fundraiser.title}</strong> how it's going: a milestone, a thank-you, when rewards will be posted.
          {audience === null ? " Counting your supporters…" : audience < 0 ? "" : audience === 0
            ? " Nobody who gave can be emailed yet, so there's no one to send it to."
            : ` It goes to ${people(audience)}, once each, with a link to stop these emails.`}
        </p>
        {going && <p className="gvg-hint" role="note">Your last update is still going out. You can send another once it's done or stopped.</p>}
        <TextField label="Subject" maxLength={150} value={subject} error={problem?.field === "subject" ? problem.words : undefined} placeholder="We reached our goal!"
          onChange={(e) => { setSubject(e.target.value); setProblem(null); }} />
        <TextArea label="Message" rows={9} maxLength={10000} value={body} error={problem?.field === "body" ? problem.words : undefined}
          placeholder="Thank you all. Printing starts next week, and rewards go out in March." hint="Plain text; blank lines start a new paragraph."
          onChange={(e) => { setBody(e.target.value); setProblem(null); }} />
        {problem && !problem.field && <p className="gvg-problem" role="alert">{problem.words}</p>}
        {updates.length > 0 && (
          <section className="gvg-updates" aria-labelledby="gvg-updates-title">
            <h3 id="gvg-updates-title" className="gvg-section-title">Your updates</h3>
            <ul>
              {updates.map((u) => {
                const state = updateState(u);
                return (
                  <li key={u.id}>
                    <div className="gvg-who"><strong>{u.subject}</strong><StatusBadge tone={state.tone}>{state.badge}</StatusBadge></div>
                    <p className="gvg-meta">{state.line}</p>
                    {u.status === "paused" && u.lastError && <p className="gvg-problem">{u.lastError}</p>}
                    {(u.status === "queued" || u.status === "sending" || u.status === "paused") && (
                      <div className="gvg-actions">
                        {u.status === "paused" && <SecondaryButton icon={<Play size={16} aria-hidden />} onClick={() => { void act(u, "updateResume"); }} busy={busy === u.id}>Carry on</SecondaryButton>}
                        <GhostButton icon={<Square size={16} aria-hidden />} onClick={() => { void act(u, "updateCancel"); }} disabled={!!busy && busy !== u.id}>Stop sending</GhostButton>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      {confirmNode}
    </Drawer>
  );
}

function FundraiserDrawer({ start, today, money, running, onClose, onSaved }: {
  start: AdminFundraiser | null; today: string; money: (minor: number) => string; running: AdminFundraiser | null; onClose: () => void; onSaved: (f: AdminFundraiser) => void;
}) {
  const [form, setForm] = useState<Omit<FundraiserInput, "goalMinor" | "rewards"> & { goal: string }>(() => ({
    title: start?.title || "", story: start?.story || "", endsOn: start?.endsOn || dayAfter(today, 29), wall: start ? start.showWall : true,
    goal: start ? String(start.goalMinor / 100) : "",
  }));
  const [rewards, setRewards] = useState<RewardRow[]>(() => rewardRowsOf(start?.rewards));
  const [problem, setProblem] = useState<{ field: string; words: string; row?: number } | null>(null);
  const [busy, setBusy] = useState<"" | "draft" | "start">("");
  const setReward = (i: number, patch: Partial<RewardRow>) => { setRewards((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r))); setProblem(null); };
  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setProblem(null); };
  const live = start?.state === "live";
  const blocked = !live && running && running.id !== start?.id ? running : null;

  const save = async (startIt: boolean) => {
    const goal = goalFromText(form.goal);
    if ("problem" in goal) { setProblem({ field: "goal", words: goal.problem }); return; }
    const offered = rewardsFromRows(rewards);
    if ("problem" in offered) { setProblem({ field: "rewards", words: offered.problem, row: offered.row }); return; }
    setBusy(startIt ? "start" : "draft");
    try {
      const answer = await givingAdmin<{ fundraiser: AdminFundraiser }>("saveFundraiser", {
        ...(start ? { id: start.id } : {}), start: startIt,
        fundraiser: { title: form.title, story: form.story, endsOn: form.endsOn, wall: form.wall, goalMinor: goal.minor, rewards: offered.rewards },
      });
      toast.success(startIt && !live ? "Your fundraiser is on your Support page." : "Saved.");
      onSaved(answer.fundraiser);
    } catch (err) {
      const words = problemOf(err, "That didn't save. Check your connection and try again.");
      const code = (err as { code?: string })?.code || "";
      setProblem({ field: ["title", "goal", "endsOn", "rewards"].includes(code) ? code : "", words });
    } finally { setBusy(""); }
  };
  const fieldError = (field: string) => (problem?.field === field ? problem.words : undefined);

  return (
    <Drawer open onClose={onClose} title={start ? "Edit fundraiser" : "Start a fundraiser"}
      footer={live ? (
        <><GhostButton onClick={onClose} disabled={!!busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(false); }} busy={busy === "draft"}>Save</PrimaryButton></>
      ) : (
        <><GhostButton onClick={() => { void save(false); }} busy={busy === "draft"} disabled={!!busy && busy !== "draft"}>Save as draft</GhostButton>
          <PrimaryButton onClick={() => { void save(true); }} busy={busy === "start"} disabled={!!blocked || (!!busy && busy !== "start")}>Start fundraiser</PrimaryButton></>
      )}>
      <div className="gvg-form">
        {blocked && <p className="gvg-hint" role="note">"{blocked.title}" is running now. You can save this as a draft and start it once that one ends.</p>}
        <TextField label="Name" maxLength={MAX_TITLE} value={form.title} error={fieldError("title")} placeholder="Help us fund our next project"
          onChange={(e) => set({ title: e.target.value })} />
        <div className="gvg-two">
          <TextField label="Goal" inputMode="decimal" value={form.goal} error={fieldError("goal")} placeholder="3000" hint={`At least ${money(10_000)}.`}
            onChange={(e) => set({ goal: e.target.value })} />
          <TextField label="Last day" type="date" min={today} max={dayAfter(today, 366)} value={form.endsOn} error={fieldError("endsOn")}
            hint="It ends at midnight that day." onChange={(e) => set({ endsOn: e.target.value })} />
        </div>
        <TextArea label="Your story" rows={7} maxLength={MAX_STORY} value={form.story} placeholder="What the money is for, and what it will make possible."
          hint="Shown under the goal bar. Plain text; blank lines start a new paragraph." onChange={(e) => set({ story: e.target.value })} />
        <Toggle label="Show supporters who agree on a wall" checked={form.wall} onChange={(v) => set({ wall: v })} />
        <p className="gvg-hint">Givers tick a box to have their name shown. Anonymous gifts never are. Only gifts paid while it runs count toward the goal, card fees left out.</p>
        <section className="gvg-rewards" aria-labelledby="gvg-rewards-title">
          <div className="gvg-rewards-head">
            <h3 id="gvg-rewards-title" className="gvg-section-title">Thank-you rewards <small>Optional</small></h3>
            <p className="gvg-hint">Something givers get for a gift of a set size, like a signed print. You post or hand it over yourself.</p>
          </div>
          {rewards.map((r, i) => (
            <fieldset key={r.id || `new-${i}`} className="gvg-reward" data-problem={problem?.field === "rewards" && problem.row === i ? true : undefined}>
              <legend className="sr-only">Reward {i + 1}</legend>
              <div className="gvg-reward-top">
                <TextField label="Reward" maxLength={MAX_REWARD_TITLE} value={r.title} placeholder="Signed print" onChange={(e) => setReward(i, { title: e.target.value })} />
                <IconButton label={r.taken > 0 ? "Someone chose this, so it stays" : "Remove this reward"} disabled={r.taken > 0}
                  onClick={() => { setRewards((rows) => rows.filter((_, j) => j !== i)); setProblem(null); }}><Trash2 size={16} aria-hidden /></IconButton>
              </div>
              <div className="gvg-two">
                <TextField label="For gifts from" inputMode="decimal" value={r.from} placeholder="50" onChange={(e) => setReward(i, { from: e.target.value })} />
                <TextField label="How many" inputMode="numeric" value={r.limit} placeholder="No limit" hint={r.taken > 0 ? `${r.taken} chosen so far.` : undefined}
                  onChange={(e) => setReward(i, { limit: e.target.value })} />
              </div>
              <TextField label="What it is (optional)" maxLength={MAX_REWARD_TEXT} value={r.description} placeholder="An A4 risograph print, signed and numbered."
                onChange={(e) => setReward(i, { description: e.target.value })} />
              <TextField label="When it's ready (optional)" maxLength={MAX_REWARD_WHEN} value={r.when} placeholder="March 2027" onChange={(e) => setReward(i, { when: e.target.value })} />
              <Toggle label="We post it, so ask for an address" checked={r.ships} onChange={(v) => setReward(i, { ships: v })} />
              {problem?.field === "rewards" && problem.row === i && <p className="gvg-problem" role="alert">{problem.words}</p>}
            </fieldset>
          ))}
          {problem?.field === "rewards" && (problem.row === undefined || !rewards[problem.row]) && <p className="gvg-problem" role="alert">{problem.words}</p>}
          {rewards.length < MAX_REWARDS && (
            <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setRewards((rows) => [...rows, blankReward()])}>Add a reward</SecondaryButton>
          )}
        </section>
        {problem && !problem.field && <p className="gvg-problem" role="alert">{problem.words}</p>}
      </div>
    </Drawer>
  );
}

/** "5, 10, 15" as clean percents, or null when any part isn't a whole percent from 1 to 50 or there are too many. */
function percentsFromText(text: string): number[] | null {
  const parts = text.split(/[\s,%]+/).filter(Boolean);
  if (!parts.length || parts.length > MAX_TIP_CHOICES) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 50)) return null;
  return cleanTipPercents(nums);
}

function SettingsDrawer({ start, money, onClose, onSaved }: { start: GivingSettings; money: (minor: number) => string; onClose: () => void; onSaved: (s: GivingSettings) => void }) {
  const [form, setForm] = useState<GivingSettings>(start);
  const [charity, setCharity] = useState<CharityForm>(charityFormOf(start.charity));
  const [charityProblem, setCharityProblem] = useState<{ field: string; text: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [tipText, setTipText] = useState((start.tipPercents || []).join(", "));
  const [tipProblem, setTipProblem] = useState("");
  const [amountProblem, setAmountProblem] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<GivingSettings>) => { setForm((f) => ({ ...f, ...patch })); setProblem(""); };

  const add = () => {
    const amount = amountFromText(typed, money);
    if ("problem" in amount) { setAmountProblem(amount.problem); return; }
    const next = withAmount(form.amounts, amount.minor);
    if ("problem" in next) { setAmountProblem(next.problem); return; }
    set({ amounts: next });
    setTyped("");
    setAmountProblem("");
  };
  const save = async () => {
    if (!form.amounts.length && !form.otherAmount) { setProblem("Add at least one amount, or let givers type their own."); return; }
    const tipPercents = percentsFromText(tipText);
    if (form.checkoutTip && !tipPercents) { setTipProblem(`Type 1 to ${MAX_TIP_CHOICES} whole percents from 1 to 50, like 5, 10, 15.`); return; }
    setBusy(true);
    try {
      const answer = await givingAdmin<{ settings: GivingSettings }>("saveSettings", { settings: { ...form, tipPercents: tipPercents || form.tipPercents, charity: charityToSave(charity) } });
      toast.success("Saved.");
      onSaved(answer.settings);
    } catch (err) {
      const field = (err as { code?: string })?.code;
      if (field && ["number", "name", "address", "signer"].includes(field)) setCharityProblem({ field, text: problemOf(err, "Check this.") });
      else setProblem(problemOf(err, "That didn't save. Check your connection and try again."));
    }
    finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Amounts & choices"
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>Save</PrimaryButton></>}>
      <div className="gvg-form">
        <fieldset className="gvg-amounts">
          <legend>Suggested amounts</legend>
          <p className="gvg-hint">The buttons on your Support page, up to {MAX_AMOUNTS}. The lowest gift is {money(500)}.</p>
          {form.amounts.length > 0 ? (
            <ul className="gvg-chips" aria-label="Suggested amounts">
              {form.amounts.map((minor) => (
                <li key={minor} className="gvg-chip">
                  <span>{money(minor)}</span>
                  <IconButton label={`Remove ${money(minor)}`} onClick={() => set({ amounts: form.amounts.filter((n) => n !== minor) })}><X size={14} aria-hidden /></IconButton>
                </li>
              ))}
            </ul>
          ) : <p className="gvg-hint">No suggested amounts: givers type their own.</p>}
          <div className="gvg-add">
            <TextField label="Add an amount" hideLabel placeholder="Add an amount, like 25" inputMode="decimal" value={typed} error={amountProblem || undefined}
              onChange={(e) => { setTyped(e.target.value); setAmountProblem(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
            <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={add} disabled={form.amounts.length >= MAX_AMOUNTS}>Add</SecondaryButton>
          </div>
        </fieldset>
        <div className="gvg-toggles">
          <Toggle label="Givers can type their own amount" checked={form.otherAmount} onChange={(v) => set({ otherAmount: v })} />
          <Toggle label="Givers can cover the card fee, so you get the whole gift" checked={form.coverFee} onChange={(v) => set({ coverFee: v })} />
          <Toggle label="Givers can give in honour or in memory of someone" checked={form.honour} onChange={(v) => set({ honour: v })} />
        </div>
        <fieldset className="gvg-amounts">
          <legend>Tip at checkout</legend>
          <Toggle label="Ask shoppers for a tip when they pay for an order" checked={form.checkoutTip} onChange={(v) => set({ checkoutTip: v })} />
          <p className="gvg-hint">Shoppers see No tip, your percents with what each comes to, and Other. Tips are never taxed or discounted, and they show on the order and in Bookkeeping.</p>
          {form.checkoutTip && (
            <TextField label="Tip choices (percents)" placeholder="5, 10, 15" inputMode="numeric" value={tipText} error={tipProblem || undefined}
              hint={`Up to ${MAX_TIP_CHOICES}, from 1 to 50.`} onChange={(e) => { setTipText(e.target.value); setTipProblem(""); }} />
          )}
        </fieldset>
        <fieldset className="gvg-amounts gvg-receipts">
          <legend>Tax receipts <StatusBadge tone="info" glyph={false}>Beta</StatusBadge></legend>
          <Toggle label="We're a registered charity: give tax receipts" checked={charity.on} onChange={(v) => { setCharity((c) => ({ ...c, on: v })); setCharityProblem(null); }} />
          <p className="gvg-hint">Givers can ask for one on your Support page. Each gets the next number of the year by email. A gift with a thank-you reward gets none.</p>
          {charity.on && (<>
            <TextField label="Registration number" placeholder="123456789 RR 0001 or 12-3456789" value={charity.number}
              hint={charityKindText(charity.number) || "Canada: your business number with RR. US: your tax ID (EIN)."}
              error={charityProblem?.field === "number" ? charityProblem.text : undefined}
              onChange={(e) => { const v = e.target.value; setCharity((c) => ({ ...c, number: v })); setCharityProblem(null); }} />
            <TextField label="Legal name" maxLength={MAX_CHARITY_NAME} value={charity.name} error={charityProblem?.field === "name" ? charityProblem.text : undefined}
              onChange={(e) => { const v = e.target.value; setCharity((c) => ({ ...c, name: v })); setCharityProblem(null); }} />
            <TextField label="Registered address" maxLength={MAX_CHARITY_ADDRESS} value={charity.address} error={charityProblem?.field === "address" ? charityProblem.text : undefined}
              onChange={(e) => { const v = e.target.value; setCharity((c) => ({ ...c, address: v })); setCharityProblem(null); }} />
            <TextField label="Who signs the receipts" maxLength={MAX_SIGNER} value={charity.signer} hint="Needed for a Canadian charity."
              error={charityProblem?.field === "signer" ? charityProblem.text : undefined}
              onChange={(e) => { const v = e.target.value; setCharity((c) => ({ ...c, signer: v })); setCharityProblem(null); }} />
            <Toggle label="Email each giver a summary of the year's gifts in January" checked={form.yearlySummary} onChange={(v) => set({ yearlySummary: v })} />
          </>)}
        </fieldset>
        <TextArea label="Your thank-you words" hint="Added to the thank-you email every giver gets. Leave it empty for the standard thanks." rows={4} maxLength={MAX_THANKS}
          value={form.thanks} onChange={(e) => set({ thanks: e.target.value })} placeholder="Every gift helps us keep printing. Thank you." />
        {problem && <p className="gvg-problem" role="alert">{problem}</p>}
      </div>
    </Drawer>
  );
}

/** Correct the name or address on a gift's receipt: the old number is cancelled and the giver gets a new one by email. */
function ReceiptDrawer({ gift, kind, onClose, onSaved }: { gift: AdminGift; kind: "ca" | "us"; onClose: () => void; onSaved: (g: AdminGift) => void }) {
  const start = gift.receipt?.address || gift.receiptAddress || null;
  const [name, setName] = useState(gift.receipt?.name || gift.name);
  const [address, setAddress] = useState<ReceiptAddress>(start || { street: "", street2: "", city: "", state: "", zip: "", country: kind === "us" ? "US" : "CA" });
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const put = (patch: Partial<ReceiptAddress>) => { setAddress((a) => ({ ...a, ...patch })); setProblem(null); };
  const hasAddress = Object.entries(address).some(([k, v]) => k !== "country" && v.trim());
  const save = async () => {
    if (!(await ask({ title: "Issue a new receipt?", message: `Receipt ${gift.receipt?.number} is cancelled and ${gift.email} gets a new one with the next number. This can't be undone.`, confirmLabel: "Issue new receipt" }))) return;
    setBusy(true);
    try {
      const answer = await givingAdmin<{ gift: AdminGift }>("reissueReceipt", { giftId: gift.id, name, address: kind === "ca" || hasAddress ? address : null });
      toast.success(`New receipt ${answer.gift.receipt?.number || ""} sent.`);
      onSaved(answer.gift);
    } catch (err) { setProblem({ field: (err as { code?: string })?.code || "", text: problemOf(err, "That didn't go through. Try again.") }); }
    finally { setBusy(false); }
  };
  const err = (f: string) => (problem?.field === f ? problem.text : undefined);
  return (
    <Drawer open onClose={onClose} title="Correct the receipt"
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>Issue new receipt</PrimaryButton></>}>
      <div className="gvg-form">
        <p className="gvg-hint">Receipt numbers are never reused. Correcting cancels {gift.receipt?.number} and issues a new number that names the one it replaces.</p>
        <TextField label="Name on the receipt" value={name} error={err("name")} onChange={(e) => { setName(e.target.value); setProblem(null); }} />
        <fieldset className="gvg-amounts">
          <legend>Address{kind === "us" ? " (optional)" : ""}</legend>
          <TextField label="Street" value={address.street} error={err("address")} onChange={(e) => put({ street: e.target.value })} />
          <TextField label="Apartment or unit (optional)" value={address.street2} onChange={(e) => put({ street2: e.target.value })} />
          <div className="gvg-address-row">
            <TextField label="City" value={address.city} onChange={(e) => put({ city: e.target.value })} />
            <TextField label={address.country === "US" ? "State" : "Province"} value={address.state} onChange={(e) => put({ state: e.target.value })} />
          </div>
          <div className="gvg-address-row">
            <TextField label={address.country === "US" ? "ZIP code" : "Postal code"} value={address.zip} onChange={(e) => put({ zip: e.target.value })} />
            <TextField label="Country (two letters)" maxLength={2} value={address.country} onChange={(e) => put({ country: e.target.value.toUpperCase() })} />
          </div>
        </fieldset>
        {problem && !["name", "address"].includes(problem.field) && <p className="gvg-problem" role="alert">{problem.text}</p>}
      </div>
      {confirmNode}
    </Drawer>
  );
}
