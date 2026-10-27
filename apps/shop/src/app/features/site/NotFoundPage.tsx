import { useSEO } from "../../lib/seo";
import { regionProps } from "./storefrontRegions";
import { Link } from "react-router";
import { getCopy } from "./storeCopy";
import { useSiteData } from "./useSiteData";
import { StorefrontThemeStyle } from "./StorefrontThemeStyle";
import { GlobalSections, TemplateSections } from "../../components/sectionRender";
import { resolveSurfaceDesign } from "./surfaceDesign";
import { StoreChrome } from "./StoreChrome";
import { useMissingRedirect } from "./useMissingRedirect";
import { useEffect } from "react";
import { ga4PageNotFound } from "../../lib/ga4";

export function NotFoundContent({ design, books = [] }: { design: any; books?: any[] }) {
  design = resolveSurfaceDesign(design, "/studio-missing-page");
  return <main {...regionProps("notFoundPanel")} data-fm-store className="fm-page min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ color: "var(--text-color)", background: "var(--bg-color)" }}>
    <StorefrontThemeStyle design={design} />
    {design?.showNotFoundMessage !== false && <><p {...regionProps("notFoundCode")} className="text-7xl font-bold opacity-40">{getCopy(design, "notFoundCode")}</p><h1 {...regionProps("notFoundHeading")}>{getCopy(design, "notFoundTitle")}</h1></>}
    {design?.showNotFoundBack !== false && <Link to="/" className="min-h-11 px-6 py-3 underline">{getCopy(design, "notFoundBack")}</Link>}
    <TemplateSections design={design} templateId="page404" books={books} />
    <GlobalSections design={design} books={books} />
  </main>;
}
export default function NotFoundPage() {
  const { settings, books } = useSiteData();
  useSEO({ title: getCopy(settings?.design, "notFoundTitle"), noindex: true });
  useMissingRedirect(true);
  // An address no route knows: missing whatever the shop data says, so it counts at once.
  useEffect(() => { ga4PageNotFound(); }, []);
  return <StoreChrome surface="page404"><NotFoundContent design={settings?.design} books={books} /></StoreChrome>;
}
