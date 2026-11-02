import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { adminApi } from "./api";
import { friendlyError } from "./settingsLayout";
import { DataTable, ErrorState, PrimaryButton, SecondaryButton, SectionCard, TextField, useConfirm, type Column } from "./riso/components";

/**
 * Customers › Trade accounts (plan 12.10). Shops you approve pay your private wholesale prices when they sign in with
 * the approved email at checkout. Paying is by card. The price is worked out on the server; this list is only who may.
 */
type Stockist = { id: string; name: string; status: "approved" | "paused"; createdAt: string };
const validEmail = (v: string) => /^[^\s/@]+@[^\s/@]+\.[^\s/@]{2,}$/.test(v) && v.length <= 254;

export function StockistsCard() {
  const [items, setItems] = useState<Stockist[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, confirmNode] = useConfirm();

  const load = async () => {
    setFailed(false);
    try { setItems(await adminApi.listStockists()); } catch { setFailed(true); }
  };
  useEffect(() => { load(); }, []);

  const id = email.trim().toLowerCase();
  const problem = id && !validEmail(id) ? "That doesn't look like an email address." : id && items?.some(s => s.id === id) ? "That shop is already on the list." : "";

  const run = async (work: () => Promise<void>, done: string, what: string) => {
    setBusy(true);
    try { await work(); await load(); toast.success(done); return true; }
    catch (err: any) { toast.error(friendlyError(err, what)); return false; }
    finally { setBusy(false); }
  };
  const add = async () => {
    if (!id || problem || !name.trim()) return;
    if (await run(() => adminApi.saveStockist(id, { name: name.trim().slice(0, 200), status: "approved" }), "Shop approved.", "approve this shop")) { setEmail(""); setName(""); }
  };
  const toggle = (s: Stockist) => run(
    () => adminApi.saveStockist(s.id, { name: s.name, status: s.status === "approved" ? "paused" : "approved", createdAt: s.createdAt }),
    s.status === "approved" ? "Wholesale prices paused for this shop." : "Wholesale prices back on for this shop.", "change this shop");
  const remove = async (s: Stockist) => {
    if (await ask({ title: "Remove this shop?", message: `${s.name} will pay your normal prices again.`, confirmLabel: "Remove shop" })) {
      await run(() => adminApi.deleteStockist(s.id), "Shop removed.", "remove this shop");
    }
  };

  const columns: Column<Stockist>[] = [
    { key: "name", header: "Shop", lead: true, render: s => s.name },
    { key: "email", header: "Sign-in email", render: s => s.id },
    { key: "status", header: "Wholesale prices", render: s => (s.status === "approved" ? "On" : "Paused") },
    { key: "actions", header: "", render: s => (
      <span style={{ display: "inline-flex", gap: 8 }}>
        <SecondaryButton onClick={() => toggle(s)} disabled={busy}>{s.status === "approved" ? "Pause" : "Turn on"}</SecondaryButton>
        <SecondaryButton onClick={() => remove(s)} disabled={busy}>Remove</SecondaryButton>
      </span>
    ) },
  ];

  return (
    <SectionCard title="Trade accounts" description="Boutiques and shops that pay your wholesale prices. They sign in at checkout with the email you approve here, and pay by card.">
      {confirmNode}
      {failed ? <ErrorState title="Couldn't load your trade accounts" description="Check your connection and try again." onRetry={load} />
        : !items ? <p className="rp-hint">Loading trade accounts…</p> : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "start" }}>
            <TextField label="Shop name" placeholder="Corner Books" value={name} onChange={e => setName(e.target.value)} />
            <TextField label="Sign-in email" placeholder="orders@cornerbooks.example" value={email} onChange={e => setEmail(e.target.value)} hint="They must sign in with this email at checkout." />
          </div>
          {problem && <p className="rp-hint" role="alert" style={{ margin: 0 }}>{problem}</p>}
          <div><PrimaryButton onClick={add} disabled={busy || !!problem || !id || !name.trim()}>Approve shop</PrimaryButton></div>
          {items.length === 0 ? <p className="rp-hint" style={{ margin: 0 }}>No trade accounts yet. Set a wholesale price on a product (Products › Pricing), then approve a shop here.</p>
            : <DataTable caption="Trade accounts" columns={columns} rows={items} rowKey={s => s.id} />}
        </div>
      )}
    </SectionCard>
  );
}
