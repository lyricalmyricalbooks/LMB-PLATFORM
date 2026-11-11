// Stockroom › To-do, drawn by the admin itself (no frame): everything waiting for the owner, grouped, most urgent
// first. The list is the stockroom's own (todo.ts); a line's button opens the page where it gets sorted out.
import { useCallback, useEffect, useMemo, useState } from "react";
import { GROUP_LABELS, SIGNAL_GROUPS, type Signal } from "@stockroom/attention-signals.js";

import { EmptyState, ErrorState, GhostButton, LoadingState, SectionCard, SecondaryButton, StatusBadge } from "../riso/components";
import { sellsBooks } from "../sells";
import { useShopSells, useShopWords } from "../shopWords";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import { buildTodo, fixTarget, readDismissed, TODO_DISMISSED_KEY, type Dismissed } from "./todo";

const TONE = { blocked: "danger", warn: "warning", info: "neutral" } as const;
const TONE_WORD = { blocked: "Now", warn: "Soon", info: "When you can" } as const;

export function TodoList({ records, dismissed, onDismiss, onRestore, onOpen, isPage }: {
  records: StockroomRecords; dismissed: Dismissed; onDismiss: (id: string) => void; onRestore: () => void;
  onOpen: (page: string, opts?: { bookId?: string }) => void; isPage: (id: string) => boolean;
}) {
  const w = useShopWords();
  const sells = useShopSells();
  const todo = useMemo(() => buildTodo(records, { words: w, booksShop: sellsBooks(sells), dismissed }), [records, w, sells, dismissed]);
  const restore = todo.hidden > 0 && (
    <p className="rp-todo-hidden">{todo.hidden} {todo.hidden === 1 ? "item is" : "items are"} dismissed. <GhostButton onClick={onRestore}>Show again</GhostButton></p>
  );
  if (!todo.total) {
    return <><EmptyState icon="✅" title="You're all caught up" description={w("Nothing in the stockroom needs you. Anything new shows up here on its own.")} />{restore}</>;
  }
  const row = (signal: Signal) => {
    const target = fixTarget(signal, isPage);
    const page = target?.page ?? null;
    return (
      <li key={signal.id} className="rp-todo-row" data-status={signal.status}>
        <div className="rp-todo-text">
          <span className="rp-todo-label"><StatusBadge glyph={false} tone={TONE[signal.status as keyof typeof TONE] || "neutral"}>{TONE_WORD[signal.status as keyof typeof TONE_WORD] || "To do"}</StatusBadge><strong>{signal.label}</strong></span>
          <span className="rp-todo-detail">{signal.detail}</span>
          {!!signal.items?.length && (
            <ul className="rp-todo-items" aria-label={`Details: ${signal.label}`}>
              {signal.items.map((item, i) => <li key={`${i}-${item.label}`}>{item.label}</li>)}
            </ul>
          )}
        </div>
        <div className="rp-todo-actions">
          {page && page !== "todo" && <SecondaryButton onClick={() => onOpen(page, target?.bookId ? { bookId: target.bookId } : undefined)}>{signal.fix?.label || "Open"}</SecondaryButton>}
          <GhostButton onClick={() => onDismiss(signal.id)} aria-label={`Dismiss: ${signal.label}`}>Dismiss</GhostButton>
        </div>
      </li>
    );
  };
  return (
    <div className="rp-todo">
      <p className="rp-todo-sum" role="status">{todo.total} to do{todo.urgent ? `, ${todo.urgent} needing you soon` : ""}</p>
      {SIGNAL_GROUPS.map((group) => {
        const items = todo.byGroup[group] || [];
        if (!items.length) return null;
        return (
          <SectionCard key={group} title={w(GROUP_LABELS[group] || group)} actions={<StatusBadge glyph={false} tone="neutral">{items.length}</StatusBadge>} flush>
            <ul className="rp-todo-list">{items.map(row)}</ul>
          </SectionCard>
        );
      })}
      {restore}
    </div>
  );
}

export function TodoPage({ onOpen, isPage, load = stockroomApi.load }: { onOpen: (page: string, opts?: { bookId?: string }) => void; isPage: (id: string) => boolean; load?: () => Promise<StockroomRecords> }) {
  const [records, setRecords] = useState<StockroomRecords | null>(null);
  const [failed, setFailed] = useState<"" | "refused" | "failed">("");
  const [dismissed, setDismissed] = useState<Dismissed>(readDismissed);
  const read = useCallback(() => {
    setFailed("");
    Promise.resolve().then(load).then(setRecords, (error) => { console.error("Stockroom records could not be read", error); setFailed(isRefusal(error) ? "refused" : "failed"); });
  }, [load]);
  useEffect(read, [read]);
  const save = (next: Dismissed) => {
    setDismissed(next);
    try { if (Object.keys(next).length) localStorage.setItem(TODO_DISMISSED_KEY, JSON.stringify(next)); else localStorage.removeItem(TODO_DISMISSED_KEY); } catch { /* private window: kept for this visit */ }
  };
  // The stockroom's records are open to the shop's owner only: a team member is told so, with nothing to retry.
  if (failed === "refused") return <EmptyState icon="🔒" title="Only the owner can see the to-do list" description="The stockroom's records are kept for the shop's owner. Ask them if you need something from here." />;
  if (failed) return <ErrorState title="The to-do list didn't load" description="Check your connection, then try again." onRetry={read} />;
  if (!records) return <LoadingState label="Loading your to-do list…" />;
  return <TodoList records={records} dismissed={dismissed} onDismiss={(id) => save({ ...dismissed, [id]: true })} onRestore={() => save({})} onOpen={onOpen} isPage={isPage} />;
}
