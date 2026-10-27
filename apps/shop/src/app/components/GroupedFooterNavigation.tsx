import { FooterMenu } from "./StoreMenu";
import { getCopy } from "../features/site/storeCopy";
import { automaticFooterItems, groupedFooterItems } from "../features/site/footerNavigation";

export function GroupedFooterNavigation({ settings, pages }: { settings: any; pages: any[] }) {
  const d = settings?.design || {};
  const custom = d.menus?.footer?.length > 0;
  const groups = groupedFooterItems(custom ? d.menus.footer : automaticFooterItems(settings, pages));
  const copyKeys: Record<string, string> = custom ? {} : { "footer-shop": "footerLinkShop", "footer-track": "footerLinkTrack", "footer-instagram": "footerLinkInstagram", "footer-contact": "footerLinkContact" };
  return <>
    {(["explore", "connect"] as const).map(group => {
      const visible = group === "explore" ? d.showFooterExplore !== false : d.showFooterConnect !== false;
      const copyKey = group === "explore" ? "footerExploreHeading" : "footerConnectHeading";
      if (!visible || !groups[group].length) return null;
      return <nav key={group} aria-label={getCopy(d, copyKey)} className="min-w-0 sm:min-w-[10rem] grid grid-rows-subgrid row-span-2 content-start"
        data-studio-target="menus:footer|copy:Footer|style:footer" data-studio-label="Footer navigation groups">
        <p className="fm-footer-heading text-white/55 text-[9px] uppercase tracking-[0.3em] mb-5"><span data-studio-copy={copyKey}>{getCopy(d, copyKey)}</span></p>
        <div className="fm-footer-list break-words"><FooterMenu items={groups[group]} copyKeys={copyKeys} /></div>
      </nav>;
    })}
  </>;
}
