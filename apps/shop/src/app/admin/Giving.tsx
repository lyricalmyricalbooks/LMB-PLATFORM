// Admin › Donations (beta, 18 November 2026; LMB-PLATFORM tasks/todo/2026-11-18-giving-g1.md). Gifts from the website's
// Support page, who gave and what they wrote, and the amounts the page suggests, in the Colophon bento look (bookings.css
// tiles + giving.css, tokens only). Shown only when Donations & tips is on for the shop (both switches, Dashboard.tsx).
// Gifts are server-only records, so every read and change goes through the server (givingApi.ts). The tile of blocked
// tries shows the card-testing guard at work.
import { useEffect, useState } from "react";
import { ExternalLink, HeartHandshake, Mail, Plus, Settings2, Undo2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, StatusBadge, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { givingAdmin, type AdminGift, type GivingList } from "./givingApi";
import { amountFromText, blockedLine, dayText, giverLine, honourText, withAmount } from "./givingView";
import { moneyText } from "./eventsView";
import { MAX_AMOUNTS, MAX_THANKS, MAX_TIP_CHOICES, cleanTipPercents, type GivingSettings } from "../../shared/givingRules";
import { SHOP_CURRENCY } from "./moneySign";
import "./bookings.css";
import "./giving.css";

const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Giving() {
  const [data, setData] = useState<GivingList | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

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

      {data.gifts.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState icon={<HeartHandshake size={24} aria-hidden />} title="No gifts yet"
            description="When someone gives from your Support page, their gift shows here with anything they wrote."
            action={<SecondaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open("/support", "_blank", "noopener")}>View Support page</SecondaryButton>} />
        </div>
      ) : (
        <ul className="gvg-list" aria-label="Gifts">
          {data.gifts.map((gift) => <GiftRow key={gift.id} gift={gift} money={money} onChanged={(next) => setData((d) => d && { ...d, gifts: d.gifts.map((g) => (g.id === next.id ? next : g)) })} />)}
        </ul>
      )}

      {editing && <SettingsDrawer start={data.settings} money={money} onClose={() => setEditing(false)}
        onSaved={(settings) => { setData((d) => d && { ...d, settings }); setEditing(false); }} />}
    </div>
  );
}

function GiftRow({ gift, money, onChanged }: { gift: AdminGift; money: (minor: number) => string; onChanged: (gift: AdminGift) => void }) {
  const [busy, setBusy] = useState<"" | "refund" | "resend">("");
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

  return (
    <li className="bkg-tile gvg-row" data-refunded={refunded || undefined}>
      <div className="gvg-main">
        <div className="gvg-who">
          <strong>{giverLine(gift)}</strong>
          {gift.anonymous && <StatusBadge tone="neutral" glyph={false}>Anonymous</StatusBadge>}
          {refunded && <StatusBadge tone="warning">Refunded</StatusBadge>}
          {gift.test && <StatusBadge tone="info" glyph={false}>Test</StatusBadge>}
        </div>
        <p className="gvg-meta">{[gift.email, dayText(gift.paidAt || gift.createdAt)].filter(Boolean).join(" · ")}</p>
        {honour && <p className="gvg-honour">{honour}</p>}
        {gift.note && <blockquote className="gvg-note">{gift.note}</blockquote>}
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
      const answer = await givingAdmin<{ settings: GivingSettings }>("saveSettings", { settings: { ...form, tipPercents: tipPercents || form.tipPercents } });
      toast.success("Saved.");
      onSaved(answer.settings);
    } catch (err) { setProblem(problemOf(err, "That didn't save. Check your connection and try again.")); }
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
        <TextArea label="Your thank-you words" hint="Added to the thank-you email every giver gets. Leave it empty for the standard thanks." rows={4} maxLength={MAX_THANKS}
          value={form.thanks} onChange={(e) => set({ thanks: e.target.value })} placeholder="Every gift helps us keep printing. Thank you." />
        {problem && <p className="gvg-problem" role="alert">{problem}</p>}
      </div>
    </Drawer>
  );
}
