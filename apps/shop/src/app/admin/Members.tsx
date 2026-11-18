// Admin › Members (beta, 18 November 2026; LMB-PLATFORM tasks/todo/2026-11-18-memberships-m1.md). The owner's
// membership plans and the people on them, in the Colophon bento look (bookings.css tiles + members.css, tokens only).
// Shown only when Memberships is on for the shop (both switches, Dashboard.tsx). Plans and memberships are server-only
// records, so every read and change goes through the server (membersApi.ts).
import { useEffect, useState } from "react";
import { BadgeCheck, ExternalLink, Package, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  Drawer, EmptyState, ErrorState, GhostButton, IconButton, LoadingState, PageActions, PrimaryButton, SecondaryButton, SelectField, StatusBadge, TextArea, TextField, Toggle, useConfirm,
} from "./riso/components";
import { membersAdmin, type AdminMember, type AdminPlan, type MembersList } from "./membersApi";
import { addressText, blankBoxRow, blankPlanForm, boxText, everyText, ordinal, nextText, planFormOf, planFromForm, stateBadge, type BoxRow, type PlanForm } from "./membersView";
import { adminApi } from "./api";
import { moneyText } from "./eventsView";
import { dayText } from "./givingView";
import { MAX_BOX_ITEMS, MAX_BOX_QUANTITY, MAX_CUTOFF_DAY, MAX_PERKS, MAX_PLAN_DESCRIPTION, MAX_PLAN_NAME, MAX_PLANS, MAX_TRIAL_DAYS, MAX_MEMBER_PERCENT } from "../../shared/membershipRules";
import { SHOP_CURRENCY } from "./moneySign";
import "./bookings.css";
import "./members.css";

const monthText = (month: string) => {
  const [y, mo] = month.split("-").map(Number);
  return y && mo ? new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : month;
};
const problemOf = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function Members() {
  const [data, setData] = useState<MembersList | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<AdminPlan | "new" | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const reload = () => membersAdmin<MembersList>("list")
    .then((answer) => { setData(answer); setError(""); })
    .catch((err) => setError(problemOf(err, "Your members didn't load.")));
  useEffect(() => { void reload(); }, []);

  if (error && !data) return <ErrorState title="Your members didn't load" description={error} onRetry={() => { void reload(); }} />;
  if (!data) return <LoadingState label="Opening your members…" />;

  const currency = data.currency || SHOP_CURRENCY;
  const money = (minor: number) => moneyText(minor, currency);
  const { totals } = data;
  const current = data.members.filter((m) => m.state !== "ended");
  const ended = data.members.filter((m) => m.state === "ended");
  const shown = showEnded ? data.members : current;
  const changed = (next: AdminMember) => setData((d) => d && { ...d, members: d.members.map((m) => (m.id === next.id ? next : m)) });

  return (
    <div className="bkg-page mbr-page">
      <PageActions>
        <SecondaryButton icon={<ExternalLink size={16} aria-hidden />} onClick={() => window.open("/membership", "_blank", "noopener")}>View Membership page</SecondaryButton>
        <PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setEditing("new")} disabled={data.plans.length >= MAX_PLANS}>New plan</PrimaryButton>
      </PageActions>

      <div className="bkg-beta" role="note">
        <StatusBadge tone="info" glyph={false}>Beta</StatusBadge>
        <span>Memberships is new. Tell us what would make it better from Help.</span>
      </div>

      {!data.ready && (
        <div role="status" className="rp-alert" data-tone="warning">
          <span className="rp-alert-glyph" aria-hidden="true">!</span>
          <div className="rp-alert-text">
            <strong className="rp-alert-title">Your card payments can't take memberships yet.</strong>
            <span className="rp-alert-detail">Memberships work with card payments through Stripe, or Square on the monthly plan. Nobody can join until then.</span>
          </div>
        </div>
      )}

      {data.ready && data.square && (
        <div role="note" className="rp-alert" data-tone="info">
          <span className="rp-alert-glyph" aria-hidden="true">i</span>
          <div className="rp-alert-text">
            <strong className="rp-alert-title">Square memberships need the monthly plan.</strong>
            <span className="rp-alert-detail">On pay as you sell, Square can't take repeating payments, so nobody can join. Switch to the monthly plan in Settings, Billing, or take payments with Stripe. Members change their card with you, not on your website.</span>
          </div>
        </div>
      )}

      {(data.boxWarnings || []).map((w) => (
        <div key={w.planId} className="rp-alert" data-tone="warning" role="status">
          <span className="rp-alert-glyph" aria-hidden="true">!</span>
          <div className="rp-alert-text">
            <strong className="rp-alert-title">Not enough stock for this month's {w.planName} boxes.</strong>
            <span className="rp-alert-detail">
              {w.members} {w.members === 1 ? "box goes" : "boxes go"} out on the {ordinal(w.cutoffDay)}. Short: {w.short.map((s) => `${s.title} (need ${s.need}, have ${s.have})`).join(", ")}.
            </span>
          </div>
        </div>
      ))}

      <section className="bkg-bento mbr-bento" aria-label="At a glance">
        <div className="bkg-tile bkg-tile-mint">
          <p className="bkg-kicker">Members</p>
          <p className="bkg-big">{totals.members}</p>
          <p className="bkg-sub mbr-soft">{totals.members === 1 ? "person with a membership" : "people with a membership"}</p>
        </div>
        <div className="bkg-tile">
          <p className="bkg-kicker">Each month</p>
          <p className="bkg-big bkg-big-money">{money(totals.monthlyMinor)}</p>
          <p className="bkg-sub">yearly plans counted as a twelfth</p>
        </div>
        <div className={totals.pastDue ? "bkg-tile bkg-tile-ink" : "bkg-tile"}>
          <p className="bkg-kicker">Payment failed</p>
          <p className="bkg-big">{totals.pastDue}</p>
          <p className={totals.pastDue ? "bkg-sub mbr-soft" : "bkg-sub"}>{totals.pastDue ? "the card is tried again, and they're asked for a new one" : "every payment went through"}</p>
        </div>
      </section>

      <p className="mbr-note">
        Members pay every month or every year on your card account, and keep what their plan gives them until the end of
        what they paid for. The card provider keeps a small extra share of each membership payment (0.7%) on top of its usual card fee.
      </p>

      <div className="mbr-head">
        <h2 className="mbr-title">Plans</h2>
        <p className="mbr-meta">{data.plans.length} of {MAX_PLANS}</p>
      </div>
      {data.plans.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState icon={<BadgeCheck size={24} aria-hidden />} title="No plans yet"
            description="Make a plan with a price, how often it's paid and what members get. It shows on your Membership page."
            action={<PrimaryButton icon={<Plus size={16} aria-hidden />} onClick={() => setEditing("new")}>New plan</PrimaryButton>} />
        </div>
      ) : (
        <ul className="mbr-plans" aria-label="Plans">
          {data.plans.map((p) => (
            <li key={p.id} className="bkg-tile mbr-plan" data-hidden={p.hidden || undefined}>
              <div className="mbr-plan-top">
                <h3>{p.name}</h3>
                {p.hidden && <StatusBadge tone="neutral" glyph={false}>Hidden</StatusBadge>}
              </div>
              <p className="mbr-price"><span>{money(p.priceMinor)}</span> {everyText(p.interval)}</p>
              {p.trialDays > 0 && <p className="mbr-meta">{p.trialDays === 1 ? "1 day free" : `${p.trialDays} days free`} before the first payment</p>}
              {p.memberPercent > 0 && <p className="mbr-meta">Members pay {p.memberPercent}% less for your products</p>}
              {p.box && <p className="mbr-meta">{boxText(p.box)}</p>}
              {p.perks.length > 0 && <ul className="mbr-perks">{p.perks.map((perk, i) => <li key={i}>{perk}</li>)}</ul>}
              <div className="mbr-plan-foot">
                <span className="mbr-meta">{p.members === 1 ? "1 member" : `${p.members} members`}</span>
                <GhostButton icon={<Pencil size={16} aria-hidden />} onClick={() => setEditing(p)}>Edit</GhostButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mbr-head">
        <h2 className="mbr-title">People</h2>
        {ended.length > 0 && <GhostButton onClick={() => setShowEnded((v) => !v)}>{showEnded ? "Hide ended" : `Show ended (${ended.length})`}</GhostButton>}
      </div>
      {shown.length === 0 ? (
        <div className="bkg-tile">
          <EmptyState icon={<BadgeCheck size={24} aria-hidden />} title={data.members.length ? "No current members" : "No members yet"}
            description="When someone joins from your Membership page, they show here with their plan and next payment." />
        </div>
      ) : (
        <ul className="mbr-list" aria-label="Members">
          {shown.map((m) => <MemberRow key={m.id} member={m} money={money} onChanged={changed} />)}
        </ul>
      )}

      {editing && <PlanDrawer start={editing === "new" ? null : editing} money={money} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
  );
}

function MemberRow({ member: m, money, onChanged }: { member: AdminMember; money: (minor: number) => string; onChanged: (m: AdminMember) => void }) {
  const [busy, setBusy] = useState<"" | "end" | "check">("");
  const [ask, confirmNode] = useConfirm();
  const badge = stateBadge(m.state);
  const live = m.state !== "ended" && m.state !== "pending";

  const endNow = async () => {
    if (!(await ask({ title: "End this membership now?", message: `${m.name || m.email} loses their membership today and no more payments are taken. Nothing already paid is refunded. This can't be undone.`, confirmLabel: "End now" }))) return;
    setBusy("end");
    try { const answer = await membersAdmin<{ member: AdminMember }>("endNow", { id: m.id }); onChanged(answer.member); toast.success("Ended."); }
    catch (err) { toast.error(problemOf(err, "That didn't go through. Try again.")); }
    finally { setBusy(""); }
  };
  const check = async () => {
    setBusy("check");
    try { const answer = await membersAdmin<{ member: AdminMember }>("refresh", { id: m.id }); onChanged(answer.member); toast.success("Up to date."); }
    catch (err) { toast.error(problemOf(err, "That didn't load. Try again.")); }
    finally { setBusy(""); }
  };

  return (
    <li className="bkg-tile mbr-row" data-state={m.state}>
      <div className="mbr-main">
        <div className="mbr-who">
          <strong>{m.name || m.email}</strong>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          {m.test && <StatusBadge tone="info" glyph={false}>Test</StatusBadge>}
        </div>
        <p className="mbr-meta">{[m.name ? m.email : "", m.startedAt ? `Member since ${dayText(m.startedAt)}` : ""].filter(Boolean).join(" · ")}</p>
        <p className="mbr-next">{nextText(m)}</p>
        {m.card && <p className="mbr-meta">Card ending {m.card.last4}{m.cardPending ? " · a new card is being added" : ""}</p>}
        {m.box && <p className="mbr-meta mbr-ship"><Package size={14} aria-hidden /> {m.address ? addressText(m.address) : "No address yet: they're asked for one in their account"}</p>}
        {m.box && m.skipMonth && m.state === "active" && <p className="mbr-meta">Skipping the {monthText(m.skipMonth)} box{m.plan?.interval === "month" ? ", and that month's payment" : ""}</p>}
        {m.box && m.lastBoxOrder && <p className="mbr-meta">Last box: {monthText(m.lastBoxMonth || "")}, <a href={`#orders/${encodeURIComponent(m.lastBoxOrder)}`}>order {m.lastBoxOrder}</a></p>}
        {m.box && m.boxProblem && m.boxProblem.month !== m.lastBoxMonth && <p className="mbr-problem">This month's box couldn't be made yet: {m.boxProblem.text} It's tried again every hour.</p>}
      </div>
      <div className="mbr-side">
        {m.plan && <p className="mbr-amount">{money(m.plan.priceMinor)}<small>{m.plan.name}, {everyText(m.plan.interval)}</small></p>}
        <div className="mbr-actions">
          <GhostButton icon={<RefreshCw size={16} aria-hidden />} onClick={() => { void check(); }} busy={busy === "check"} disabled={!!busy}>Check again</GhostButton>
          {live && <GhostButton icon={<X size={16} aria-hidden />} onClick={() => { void endNow(); }} busy={busy === "end"} disabled={!!busy}>End now</GhostButton>}
        </div>
      </div>
      {confirmNode}
    </li>
  );
}

function PlanDrawer({ start, money, onClose, onSaved }: { start: AdminPlan | null; money: (minor: number) => string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PlanForm>(start ? planFormOf(start) : blankPlanForm());
  const [problem, setProblem] = useState<{ field: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PlanForm>) => { setForm((f) => ({ ...f, ...patch })); setProblem(null); };
  const fixed = !!start;
  const err = (field: string) => (problem?.field === field ? problem.text : undefined);
  // Products for the box rows, read once the box is switched on.
  const [books, setBooks] = useState<{ id: string; title: string; variants: { id: string; name: string }[] }[] | null>(null);
  useEffect(() => {
    if (!form.boxOn || books) return;
    adminApi.getAllBooks({ includePrivate: false })
      .then((list: any[]) => setBooks(list.filter((b) => b && b.status !== "archived").map((b) => ({ id: String(b.id), title: String(b.title || "Untitled"), variants: (b.variants || []).filter((v: any) => v?.id).map((v: any) => ({ id: String(v.id), name: String(v.name || v.id) })) }))
        .sort((a, b) => a.title.localeCompare(b.title))))
      .catch(() => setBooks([]));
  }, [form.boxOn, books]);
  const setRow = (i: number, patch: Partial<BoxRow>) => set({ boxRows: form.boxRows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async () => {
    const clean = planFromForm(form, money);
    if ("problem" in clean) { setProblem({ field: clean.field, text: clean.problem }); return; }
    if (clean.plan.perks.length > MAX_PERKS) { setProblem({ field: "perks", text: `Up to ${MAX_PERKS} lines.` }); return; }
    setBusy(true);
    try {
      await membersAdmin("savePlan", { ...(start ? { id: start.id } : {}), plan: clean.plan });
      toast.success("Saved.");
      onSaved();
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      setProblem({ field: ["name", "price", "trial", "interval", "percent", "box"].includes(code) ? code : "form", text: problemOf(e, "That didn't save. Check your connection and try again.") });
    } finally { setBusy(false); }
  };

  return (
    <Drawer open onClose={onClose} title={start ? "Edit plan" : "New plan"}
      footer={<><GhostButton onClick={onClose} disabled={busy}>Cancel</GhostButton><PrimaryButton onClick={() => { void save(); }} busy={busy}>Save</PrimaryButton></>}>
      <div className="mbr-form">
        <TextField label="Name" placeholder="Friends of the shop" maxLength={MAX_PLAN_NAME} value={form.name} error={err("name")} onChange={(e) => set({ name: e.target.value })} />
        <TextArea label="Description (optional)" rows={3} maxLength={MAX_PLAN_DESCRIPTION} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="mbr-two">
          <TextField label="Price" inputMode="decimal" placeholder="15" value={form.price} error={err("price")} disabled={fixed} onChange={(e) => set({ price: e.target.value })} />
          <SelectField label="Paid" value={form.interval} disabled={fixed} onChange={(e) => set({ interval: e.target.value === "year" ? "year" : "month" })}>
            <option value="month">Every month</option>
            <option value="year">Every year</option>
          </SelectField>
        </div>
        {fixed && <p className="mbr-hint">The price and how often it's paid stay as they are, because members joined at that price. To change them, make a new plan and hide this one.</p>}
        <TextField label="Free days before the first payment (optional)" inputMode="numeric" placeholder="0" hint={`Up to ${MAX_TRIAL_DAYS} days.`} value={form.trial} error={err("trial")} onChange={(e) => set({ trial: e.target.value })} />
        <TextField label="Member price: % off your products (optional)" inputMode="numeric" placeholder="0" hint={`Members pay this much less for every product at checkout, worked out by the shop when they're signed in. Gift cards stay at full price. Up to ${MAX_MEMBER_PERCENT}%.`} value={form.percent} error={err("percent")} onChange={(e) => set({ percent: e.target.value })} />
        <TextArea label="What members get (optional)" rows={4} hint={`One line each, up to ${MAX_PERKS}. Shown as a list on your Membership page.`} value={form.perks} error={err("perks")} onChange={(e) => set({ perks: e.target.value })} />
        <fieldset className="mbr-box">
          <legend className="sr-only">Box</legend>
          <Toggle label="Send members a box every month" checked={form.boxOn} onChange={(boxOn) => set({ boxOn })} />
          <p className="mbr-hint">Like a monthly club or a subscription box. On the cut-off day, each paid member gets an order for what's below, at no extra cost, and it ships like any other order. Members give their address when they join. Up to {MAX_BOX_ITEMS} products, {MAX_BOX_QUANTITY} of each.</p>
          {form.boxOn && (
            <>
              {books === null ? <p className="mbr-meta">Loading your products…</p> : form.boxRows.map((r, i) => {
                const book = books.find((b) => b.id === r.bookId);
                return (
                  <div key={i} className="mbr-box-row" data-edition={book?.variants.length ? "" : undefined}>
                    <SelectField label={i === 0 ? "Product" : `Product ${i + 1}`} value={r.bookId} onChange={(e) => setRow(i, { bookId: e.target.value, variantId: "" })}>
                      <option value="">Choose a product</option>
                      {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                    </SelectField>
                    {!!book?.variants.length && (
                      <SelectField label="Edition" value={r.variantId} onChange={(e) => setRow(i, { variantId: e.target.value })}>
                        <option value="">Choose an edition</option>
                        {book.variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </SelectField>
                    )}
                    <TextField label="How many" inputMode="numeric" value={r.quantity} placeholder="1"onChange={(e) => setRow(i, { quantity: e.target.value })} />
                    <IconButton label="Remove this product" disabled={form.boxRows.length === 1} onClick={() => set({ boxRows: form.boxRows.filter((_, j) => j !== i) })}><Trash2 size={16} aria-hidden /></IconButton>
                  </div>
                );
              })}
              {books !== null && form.boxRows.length < MAX_BOX_ITEMS && (
                <SecondaryButton icon={<Plus size={16} aria-hidden />} onClick={() => set({ boxRows: [...form.boxRows, blankBoxRow()] })}>Add another product</SecondaryButton>
              )}
              <SelectField label="Cut-off day" value={form.cutoff} hint="The day of each month the box orders are made. Members who are paid up that day get one." onChange={(e) => set({ cutoff: e.target.value })}>
                {Array.from({ length: MAX_CUTOFF_DAY }, (_, i) => String(i + 1)).map((d) => <option key={d} value={d}>{ordinal(Number(d))} of the month</option>)}
              </SelectField>
              {problem?.field === "box" && <p className="mbr-problem" role="alert">{problem.text}</p>}
            </>
          )}
        </fieldset>
        <Toggle label="Hide this plan: take no new members (current members stay)" checked={form.hidden} onChange={(hidden) => set({ hidden })} />
        {problem && !["name", "price", "trial", "perks", "percent", "box"].includes(problem.field) && <p className="mbr-problem" role="alert">{problem.text}</p>}
      </div>
    </Drawer>
  );
}

