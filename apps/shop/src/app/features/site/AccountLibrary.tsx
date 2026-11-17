import { Download, Headphones, Play } from "lucide-react";
import { libraryEntries, type DigitalEntry } from "./digitalLine";
import { regionProps } from "./storefrontRegions";
import { getCopy } from "./storeCopy";

/**
 * The account's Library (Digital D1b): every download from every paid order in one list, each file once (through the
 * newest order that holds it). Nothing shows until the shopper owns a download. Words: Text & labels › Customer account ›
 * Downloads & library; region `accountLibrary`.
 */
export function AccountLibrary({ design, orders, entriesByOrder, onDownload, onPlay }: {
  design: any;
  orders: any[];
  entriesByOrder: Record<string, DigitalEntry[]>;
  onDownload: (order: any, itemId: string, variantId: string, file: number) => void;
  /** Digital D3 (Beta): open the in-page player for an audiobook or video. Without it only Download shows. */
  onPlay?: (item: DigitalEntry & { order: any }) => void;
}) {
  const library = libraryEntries(orders, entriesByOrder);
  if (library.length === 0) return null;
  const download = getCopy(design, "accountDownload");
  return (
    <section {...regionProps("accountLibrary")} aria-labelledby="fm-account-library" className="glass-card border border-white/5 rounded-[2.5rem] p-6 sm:p-10">
      <h2 id="fm-account-library" className="text-xs font-black tracking-[0.5em] text-white/30 uppercase">{getCopy(design, "accountLibraryTitle")}</h2>
      <p className="text-[11px] fm-muted mt-2 mb-6 sm:mb-8 leading-relaxed">{getCopy(design, "accountLibraryText")}</p>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none p-0 m-0">
        {library.map((item) => (
          <li key={`${item.itemId}|${item.variantId}|${item.file}`} className="fm-surface-2 border border-white/5 rounded-xl p-4 flex justify-between items-center gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-white uppercase break-words line-clamp-2" title={item.title}>{item.title}</p>
              <p className="text-[9px] fm-muted uppercase tracking-widest mt-1 break-words">{getCopy(design, "accountLibraryFrom", { order: item.order.orderId || item.order.id })}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            {onPlay && item.media && (
              <button
                type="button"
                onClick={() => onPlay(item)}
                className="min-h-[44px] min-w-[44px] justify-center px-3 sm:px-4 rounded-lg transition-all flex items-center gap-2 border border-white/20 text-white active:scale-95 text-[9px] font-black tracking-widest uppercase"
                aria-label={`${getCopy(design, item.media === "video" ? "accountWatch" : "accountListen")}: ${item.title}`}
              >
                {item.media === "video" ? <Play size={12} aria-hidden="true" /> : <Headphones size={12} aria-hidden="true" />}
                <span className="hidden sm:inline">{getCopy(design, item.media === "video" ? "accountWatch" : "accountListen")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onDownload(item.order, item.itemId, item.variantId, item.file)}
              className="text-white min-h-[44px] min-w-[44px] justify-center px-3 sm:px-4 rounded-lg transition-all flex items-center gap-2 shrink-0 active:scale-95 text-[9px] font-black tracking-widest uppercase"
              style={{ backgroundColor: "var(--accent)" }}
              aria-label={`${download}: ${item.title}`}
            >
              <Download size={12} aria-hidden="true" />
              <span className="hidden sm:inline">{download}</span>
            </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
