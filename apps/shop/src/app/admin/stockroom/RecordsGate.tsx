// Loads the stockroom's records for a page and draws the loading and failure states the pages share (lessons from the
// To-do page): a failed read is never an empty record, and a team member (refused by the rules) is told, with no retry.
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "../riso/components";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroomData";

export function RecordsGate({ what, load = stockroomApi.load, children }: {
  /** What the page shows, for the messages: "stockists", "shipping" … */
  what: string; load?: () => Promise<StockroomRecords>; children: (records: StockroomRecords) => ReactNode;
}) {
  const [records, setRecords] = useState<StockroomRecords | null>(null);
  const [failed, setFailed] = useState<"" | "refused" | "failed">("");
  const read = useCallback(() => {
    setFailed("");
    Promise.resolve().then(load).then(setRecords, (error) => { console.error("Stockroom records could not be read", error); setFailed(isRefusal(error) ? "refused" : "failed"); });
  }, [load]);
  useEffect(read, [read]);
  if (failed === "refused") return <EmptyState icon="🔒" title={`Only the owner can see ${what}`} description="The stockroom's records are kept for the shop's owner. Ask them if you need something from here." />;
  if (failed) return <ErrorState title={`${what[0].toUpperCase()}${what.slice(1)} didn't load`} description="Check your connection, then try again." onRetry={read} />;
  if (!records) return <LoadingState label={`Loading ${what}…`} />;
  return <>{children(records)}</>;
}
