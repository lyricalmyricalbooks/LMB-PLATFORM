// Stockroom › Open call, drawn by the admin itself (no frame): contributors moving through the stockroom's stages, per
// item, with whose move it is and who has waited longest. Read-only: sending the emails waits for the safe write layer.
import { useState } from "react";
import { OC_STAGES } from "@stockroom/opencall.js";

import { EmptyState, InkButton, MetricCard, SectionCard, SecondaryButton, StatusBadge, type BadgeTone } from "../riso/components";
import { useShopWords } from "../shopWords";
import type { NativePageProps } from "./nativePages";
import { buildOpenCall, MOVE_WORDS, PROBLEM_WORDS, type Contributor, type Move, type OpenCallView } from "./openCall";
import { RecordsGate } from "./RecordsGate";
import type { StockroomRecords } from "./stockroomData";
import "./stockroom.css";
import "./stockists.css";

const MOVE_TONE: Record<Move, BadgeTone> = { you: "warning", artist: "info", blocked: "danger", done: "success" };
type Filter = "all" | Move | "nudge";

const matches = (c: Contributor, f: Filter) => f === "all" || (f === "nudge" ? c.nudge : c.move === f);

function Row({ c }: { c: Contributor }) {
  return (
    <li className="rp-sk-row rp-oc-row" data-move={c.move}>
      <div className="rp-sk-row-main">
        <span className="rp-oc-who"><strong>{c.name}</strong><StatusBadge tone={MOVE_TONE[c.move]}>{MOVE_WORDS[c.move]}</StatusBadge></span>
        <ol className="rp-oc-track" aria-label={`${c.done} of ${OC_STAGES.length} stages done`}>
          {c.stages.map((s) => <li key={s.key} data-state={s.state} title={s.label}><span className="rp-sr-only">{s.label}: {s.state === "done" ? "done" : s.state === "todo" ? "later" : "next"}</span></li>)}
        </ol>
        <span className="rp-sk-meta">{c.move === "done" ? "Every stage is done" : `${c.done} of ${OC_STAGES.length} stages done · next stage: ${c.stageLabel} (${c.next})`}</span>
        {c.problems.length > 0 && <span className="rp-sk-meta rp-sk-warn">{c.problems.map((p) => PROBLEM_WORDS[p] || p).join(" · ")}</span>}
      </div>
      <div className="rp-sk-row-end">
        {c.waitingDays != null && <span className="rp-sk-amount">{c.waitingDays} {c.waitingDays === 1 ? "day" : "days"}</span>}
        {c.nudge && <StatusBadge tone="warning">Reminder due</StatusBadge>}
      </div>
    </li>
  );
}

export function OpenCallBoard({ view }: { view: OpenCallView }) {
  const w = useShopWords();
  const [filter, setFilter] = useState<Filter>("all");
  if (!view.total) {
    return <EmptyState icon="📬" title="No contributors yet" description={w("People from your open call appear here once the stockroom has their details, with where each one is up to.")} />;
  }
  const chip = (key: Filter, label: string, n: number) => {
    const Btn = filter === key ? InkButton : SecondaryButton;
    return <Btn size="sm" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} {n}</Btn>;
  };
  return (
    <div className="rp-sk">
      <div className="rp-grid-metrics">
        <MetricCard label="Contributors" value={view.total} footer={`${view.counts.done} finished`} />
        <MetricCard label="Your move" value={view.counts.you} tone={view.counts.you ? "warn" : undefined} footer="an email from you is next" />
        <MetricCard label="Waiting on them" value={view.counts.artist} footer={view.nudge ? `${view.nudge} due a reminder` : "no reminder due"} />
        <MetricCard label="Can't email" value={view.counts.blocked} tone={view.counts.blocked ? "danger" : undefined} footer="missing or bounced address" />
      </div>
      <div className="rp-sk-chips" role="group" aria-label="Show contributors">
        {chip("all", "Everyone", view.total)}{chip("you", "Your move", view.counts.you)}{chip("artist", "Waiting on them", view.counts.artist)}
        {chip("nudge", "Reminder due", view.nudge)}{chip("blocked", "Can't email", view.counts.blocked)}{chip("done", "Finished", view.counts.done)}
      </div>
      {view.items.map((item) => {
        const rows = item.contributors.filter((c) => matches(c, filter));
        if (!rows.length) return null;
        return (
          <SectionCard key={item.bookId} title={item.title} actions={<StatusBadge tone="neutral" glyph={false}>{item.contributors.length}</StatusBadge>}>
            <ul className="rp-sk-list">{rows.map((c) => <Row key={c.key} c={c} />)}</ul>
          </SectionCard>
        );
      })}
      {view.items.every((i) => !i.contributors.some((c) => matches(c, filter))) && <EmptyState inline title="Nobody here" description="Pick Everyone to see all contributors again." />}
    </div>
  );
}

export function OpenCallPage({ load }: Partial<NativePageProps> & { load?: () => Promise<StockroomRecords> }) {
  return <RecordsGate what="the open call" load={load}>{(records) => <OpenCallBoard view={buildOpenCall(records)} />}</RecordsGate>;
}
