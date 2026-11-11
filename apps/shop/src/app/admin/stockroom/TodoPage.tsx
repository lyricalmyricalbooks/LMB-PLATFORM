// Stockroom › To-do, drawn by the admin itself (no frame): everything waiting for the owner, grouped, most urgent
// first. The list is the stockroom's own (todo.ts); a line's button opens the page where it gets sorted out.
import { useCallback, useEffect, useMemo, useState } from "react";
import { GROUP_LABELS, SIGNAL_GROUPS, type Signal } from "@stockroom/attention-signals.js";

import { EmptyState, GhostButton, LoadingState, SecondaryButton, SectionCard, StatusBadge } from "../riso/components";
import { sellsBooks } from "../sells";
import { useShopSells, useShopWords } from "../shopWords";
import { stockroomApi, type StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import { buildTodo, fixPage, readDismissed, TODO_DISMISSED_KEY, type Dismissed } from "./todo";

const TONE = { blocked: "danger", warn: "warning", info: "neutral" } as const;
const TONE_WORD = { blocked: "Now", warn: "Soon", info: "When you can" } as const;

export function TodoList({ records, dismissed, onDismiss, onRestore, onOpen, isPage }: {
  records: StockroomRecords; dismissed: Dismissed; onDismiss: (id: string) => void; onRestore: () => void;
  onOpen: (page: string) => void; isPage: (id: string) => boolean;
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
    const page = fixPage(signal, isPage);
    return (
      <li key={signal.id} className="rp-todo-row" data-status={signal.status}>
        <div className="rp-todo-text">
          <span className="rp-todo-label"><StatusBadge glyph={false} tone={TONE[signal.status as keyof typeof TONE] || "neutral"}>{TONE_WORD[signal.status as keyof typeof TONE_WORD] || "To do"}</StatusBadge><strong>{signal.label}</strong></span>
          <span className="rp-todo-detail">{signal.detail}</span>
        </div>
        <div className="rp-todo-actions">
          {page && page !== "todo" && <SecondaryButton onClick={() => onOpen(page)}>{signal.fix?.label || "Open"}</SecondaryButton>}
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

export function TodoPage({ onOpen, isPage, load = stockroomApi.load }: { onOpen: (page: string) => void; isPage: (id: string) => boolean; load?: () => Promise<StockroomRecords> }) {
  const [records, setRecords] = useState<StockroomRecords | null>(null);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState<Dismissed>(readDismissed);
  const read = useCallback(() => {
    setFailed(false);
    Promise.resolve().then(load).then(setRecords, (error) => { console.error("Stockroom records could not be read", error); setFailed(true); });
  }, [load]);
  useEffect(read, [read]);
  const save = (next: Dismissed) => {
    setDismissed(next);
    try { if (Object.keys(next).length) localStorage.setItem(TODO_DISMISSED_KEY, JSON.stringify(next)); else localStorage.removeItem(TODO_DISMISSED_KEY); } catch { /* private window: kept for this visit */ }
  };
  if (failed) return <EmptyState icon="⚠" title="The to-do list didn't load" description="Check your connection, then try again." action={<SecondaryButton onClick={read}>Try again</SecondaryButton>} />;
  if (!records) return <LoadingState label="Loading your to-do list…" />;
  return <TodoList records={records} dismissed={dismissed} onDismiss={(id) => save({ ...dismissed, [id]: true })} onRestore={() => save({})} onOpen={onOpen} isPage={isPage} />;
}
