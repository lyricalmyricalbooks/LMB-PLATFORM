// Loads the stockroom's records for a page and draws the three states every stockroom page needs: loading, a team
// member refused by the rules (owner-only data: no retry), and a failed read (never mistaken for an empty record).
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "../riso/components";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroomData";

export function RecordsGate({ what, load = stockroomApi.load, children }: {
  /** What the page shows, for its messages: "the sales records". */ what: string;
  load?: () => Promise<StockroomRecords>;
  children: (records: StockroomRecords) => ReactNode;
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
