import { Link } from "react-router";
import { useRecentlyViewed } from "../../lib/recentlyViewed";
import { useSiteData } from "./useSiteData";
import { placeholderImage } from "./constants";
import { designNumber } from "./designNumber";
import { getCopy } from "./storeCopy";
import { contentMaxWidth } from "./headerNav";
import { regionProps } from "./storefrontRegions";
import { gridPhotoSizes, photoSrcSet } from "./photoSources";
import { framingStyle } from "./photoFraming";
import { PhotoToneDefs } from "./PhotoToneDefs";

export default function RecentlyViewedRow({ excludeId }: { excludeId?: string }) {
  const { ids } = useRecentlyViewed();
  const { books, settings } = useSiteData();

  const items = ids
    .filter(id => id !== excludeId)
    .map(id => books.find(b => b.id === id))
    .filter(Boolean)
    .slice(0, Math.max(1, designNumber(settings?.design, "recentlyViewedCount", 6))) as any[];

  if (items.length === 0 || (settings?.design as any)?.showRecentlyViewed === false) return null;

  return (
    <section {...regionProps("recentRow")} data-ga-list="Recently viewed" className="border-t border-white/[0.06]">
      <div className="mx-auto px-6 py-14" style={{ maxWidth: contentMaxWidth({ ...(settings?.design || {}), ...((settings?.design as any)?.storefront || {}) }) }}>
        <div {...regionProps("recentHeading")} className="flex items-center gap-6 mb-8">
          <h2 className="text-[10px] font-black tracking-[0.5em] text-white/30 uppercase">
            {getCopy(settings?.design, "recentlyViewedHeading")}
          </h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <div {...regionProps("recentGrid")} className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-5">
          {items.map(book => {
            const slug = book.slug || book.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            return (
              <Link key={book.id} to={`/books/${slug}`} className="fm-card group min-w-0">
                <div {...regionProps("recentPhoto")} className="relative aspect-[3/4] fm-surface rounded-xl overflow-hidden border border-white/[0.05]">
                  <img
                    loading="lazy"
                    src={book.photos?.[0]?.url || placeholderImage(settings?.design)}
                    {...photoSrcSet(book.photos?.[0], gridPhotoSizes([{ from: 0, cols: 3 }, { from: 640, cols: 4 }, { from: 1024, cols: 6 }], { photo: book.photos?.[0], frame: "3 / 4" }))}
                    alt={book.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={framingStyle(book.photos?.[0])}
                  />
                  <PhotoToneDefs photo={book.photos?.[0]} />
                </div>
                <p className="fm-card-title mt-2 text-[9px] font-black tracking-widest uppercase text-white/40 group-hover:text-white/80 transition-colors leading-tight" data-studio-target="style:products" data-studio-label="Card title & price">
                  {book.title}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
