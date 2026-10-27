// Workbench › Setup (Studio 3.0 phase 1): a launch checklist read from the design and shop data Studio already has.
// Pure: each item says whether it is done and where Studio should take the owner to do it ("Show me").
import { POLICY_KEYS } from "../../features/site/policyPages";

export type SetupGo =
  | { kind: "target"; target: string }
  | { kind: "tab"; tab: "sections" }
  | { kind: "device"; device: "mobile" }
  | { kind: "health" }
  | { kind: "brand" }
  | { kind: "publish" };

export type SetupItem = { id: string; title: string; detail: string; done: boolean; /** Where "Show me" goes; none when the job is done outside Studio. */ go?: SetupGo };

export type SetupInput = {
  design: any;
  /** The design shoppers see now (null/undefined when nothing was ever published). */
  published?: any;
  /** The design Studio started from by default (theme preset / built-in defaults). */
  defaults?: any;
  /** settings.policies (shipping / returns / privacy / terms text). */
  policies?: Record<string, string | undefined>;
  /** Session facts: the phone preview was opened, Health ran with this many issues (null = not run). */
  phoneChecked?: boolean;
  healthIssues?: number | null;
  /** Things to fix found by the last complete "Check every page" run in this browser (null = never run). */
  siteIssues?: number | null;
};

const filled = (v: unknown) => typeof v === "string" ? v.trim() !== "" : v != null && v !== false;
const COLOR_KEYS = ["backgroundColor", "textColor", "primaryColor", "secondaryColor", "surfaceColor"];

export function setupChecklist(i: SetupInput): SetupItem[] {
  const d = i.design || {};
  const defaults = i.defaults || {};
  const copy = d.copy || {};
  const homeSections = Array.isArray(d.heroPage?.sections) ? d.heroPage.sections.filter((s: any) => s && s.enabled !== false) : [];
  const writtenPolicies = POLICY_KEYS.filter(k => filled(i.policies?.[k])).length;
  const changedColours = COLOR_KEYS.some(k => filled(d[k]) && d[k] !== defaults[k]) || (Array.isArray(d.colorSchemes) && d.colorSchemes.length > 0);
  const fontsChosen = (filled(d.headingFont) && d.headingFont !== defaults.headingFont) || (filled(d.bodyFont) && d.bodyFont !== defaults.bodyFont);
  const logoDone = filled(d.logoUrl) || filled(d.wordmarkPrimary);
  return [
    { id: "brand", title: "Set up your brand in one go", detail: "The brand kit: logo, colours from it, a personality for your type and a starter Home page, previewed before you apply.",
      done: (logoDone && changedColours && fontsChosen) || (Array.isArray(d.colorSchemes) && d.colorSchemes.some((s: any) => s?.id === "brand-accent")), go: { kind: "brand" } },
    { id: "logo", title: "Add your logo or wordmark", detail: "Shown in the header, the footer and emails.",
      done: logoDone, go: { kind: "target", target: "style:logo" } },
    { id: "colors", title: "Make the colours yours", detail: "Change the page, text or accent colour, or add a colour scheme.",
      done: changedColours, go: { kind: "target", target: "style:colors" } },
    { id: "fonts", title: "Choose your fonts", detail: "A heading and a body font from Google Fonts.",
      done: fontsChosen, go: { kind: "target", target: "style:type" } },
    { id: "share", title: "Add a share image", detail: "The picture shown when your shop is shared in messages and social posts.",
      done: filled(d.shareImageUrl), go: { kind: "target", target: "style:logo" } },
    { id: "seo", title: "Write your Google listing", detail: "Home page title and description under Text & labels › Site & sharing.",
      done: filled(copy.siteDefaultTitle) && filled(copy.siteDefaultDescription), go: { kind: "target", target: "copy:Site & sharing" } },
    { id: "home", title: "Build your Home page", detail: "At least two sections on Home (or turn Home off to open on the catalog).",
      done: d.showHero === false || homeSections.length >= 2, go: { kind: "tab", tab: "sections" } },
    { id: "policies", title: "Write your shop policies", detail: `Shipping, returns, privacy and terms (${writtenPolicies} of ${POLICY_KEYS.length} written). Write them in Admin › Settings › General › Store policies.`,
      done: writtenPolicies === POLICY_KEYS.length },
    { id: "phone", title: "Look at your shop on a phone", detail: "Most shoppers visit on a phone. Switch the preview to phone size.",
      done: Boolean(i.phoneChecked), go: { kind: "device", device: "mobile" } },
    { id: "health", title: "Run Studio Health with nothing to fix", detail: "Checks contrast, picture descriptions, links and tap targets: on the page in the preview, or every page at once with Check every page.",
      done: i.healthIssues === 0 || i.siteIssues === 0, go: { kind: "health" } },
    { id: "publish", title: "Publish your design", detail: "Shoppers only see what you publish.",
      done: Boolean(i.published), go: { kind: "publish" } },
  ];
}

export const setupProgress = (items: SetupItem[]) => ({ done: items.filter(x => x.done).length, total: items.length });
