// Loads the stockroom's records for a page and draws the loading, refused and failed states the same way on every page.
// A refusal by the rules (a team member: the records are the owner's) is told so with nothing to retry; any other failure
// is an error with Try again, never an empty page.
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { EmptyState, ErrorState, LoadingState } from "../riso/components";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroomData";

export function RecordsGate({ load = stockroomApi.load, what, children }: {
  load?: () => Promise<StockroomRecords>;
  /** The page's name in the messages: "the Tax centre". */
  what: string;
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
