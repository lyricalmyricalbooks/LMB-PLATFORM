import { useEffect, useState } from "react";
import { adminApi } from "./api";
import { SelectField, TextField, SecondaryButton } from "./riso/components";

type Swap = { toVariantId: string; quantity: string };
const stockOf = (v: any) => Number(v.stockLevel !== undefined ? v.stockLevel : v.stock) || 0;
const priceOf = (book: any, v: any) => Number(v && v.price !== undefined && v.price !== "" ? v.price : book.retailPrice);

/** For each returned item: the other versions of its product at the same price with stock. Items with none are left out. */
export function exchangeChoices(order: any, inspected: any[], books: Record<string, any>) {
  return inspected.filter(r => Number(r.quantity) > 0).map(r => {
    const item = order.items?.[r.index];
    const book = item && books[item.id];
    const versions: any[] = Array.isArray(book?.variants) ? book.variants : [];
    const from = versions.find(v => v.id === (item?.variantId || null));
    const options = versions.filter(v => v.id !== item?.variantId && priceOf(book, v) === priceOf(book, from) && stockOf(v) > 0);
    return { r, item, options, noBoxSet: !(Array.isArray(item?.components) && item.components.length) };
  }).filter(x => x.item && x.options.length && x.noBoxSet);
}

/**
 * Swap for another size (plan 10.22) for an inspected return: for each returned item whose product has other versions at
 * the same price, pick the version to send. The server does the stock and the checks (functions/exchanges.js); this only
 * lists what can be chosen and says plainly when nothing can.
 */
export function ReturnExchange({ order, inspected, busy, onExchange }: {
  order: any; inspected: any[]; busy: boolean; onExchange: (swaps: { index: number; toVariantId: string; quantity: number }[]) => void;
}) {
  const [books, setBooks] = useState<Record<string, any> | null>(null);
  const [picks, setPicks] = useState<Record<number, Swap>>({});
  useEffect(() => {
    let alive = true;
    const ids = [...new Set(inspected.filter(r => Number(r.quantity) > 0).map(r => order.items?.[r.index]?.id).filter(Boolean))] as string[];
    Promise.all(ids.map(id => adminApi.getBook(id).catch(() => null))).then(rows => {
      if (alive) setBooks(Object.fromEntries(ids.map((id, i) => [id, rows[i]])));
    });
    return () => { alive = false; };
  }, [order.id, inspected]);
  if (!books) return null;
  const rows = exchangeChoices(order, inspected, books);
  if (!rows.length) return null;
  const chosen = rows.filter(({ r }) => picks[r.index]?.toVariantId);
  const swaps = chosen.map(({ r }) => ({ index: r.index, toVariantId: picks[r.index].toVariantId, quantity: Number(picks[r.index].quantity || r.quantity) }));
  const valid = swaps.length > 0 && chosen.every(({ r, options }, i) => {
    const q = swaps[i].quantity, to = options.find(v => v.id === swaps[i].toVariantId);
    return Number.isInteger(q) && q >= 1 && q <= Number(r.quantity) && !!to && stockOf(to) >= q;
  });
  const set = (index: number, patch: Partial<Swap>) => setPicks(prev => ({ ...prev, [index]: { ...{ toVariantId: "", quantity: "" }, ...(prev[index] as Swap | undefined), ...patch } }));
  return <div className="rp-stack" role="group" aria-label="Swap for another size">
    <strong>Or swap for another size or colour</strong>
    <p className="rp-hint">No money moves. The returned copies go back on the shelf if they were resellable, the new version comes off it, and you send the new items yourself. Only versions at the same price with stock are listed.</p>
    {rows.map(({ r, item, options }) => <div key={r.index} className="rp-stack">
      <SelectField label={`${item.title}${item.variantName ? ` · ${item.variantName}` : ""} · ${r.quantity} came back`} value={picks[r.index]?.toVariantId || ""} onChange={e => set(r.index, { toVariantId: e.target.value })}>
        <option value="">Don't swap this one</option>
        {options.map(v => <option key={v.id} value={v.id}>{v.name} ({stockOf(v)} in stock)</option>)}
      </SelectField>
      {picks[r.index]?.toVariantId && Number(r.quantity) > 1 && <TextField label="How many to swap" type="number" min={1} max={r.quantity} step={1} value={picks[r.index]?.quantity ?? ""} placeholder={String(r.quantity)} onChange={e => set(r.index, { quantity: e.target.value })} />}
    </div>)}
    <div><SecondaryButton disabled={busy || !valid} onClick={() => onExchange(swaps)}>Swap and finish the return</SecondaryButton></div>
  </div>;
}
