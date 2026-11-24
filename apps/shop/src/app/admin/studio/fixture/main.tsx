// Development-only entry for studio-fixture.html: the real Studio with an in-memory adminApi.
// Browser checks (scripts/studio-e2e.mjs) read window.__studioFixture.calls to see what Studio
// would have saved.
import { createRoot } from "react-dom/client";
import "../../../../styles/index.css";
import "../../../../styles/adminCompat.css";
import { adminApi } from "../../api";
import { StudioEditor } from "../StudioEditor";
import { createStudioFixture, installFakeStudioApi } from "./fakeStudioApi";
import { parseStudioLocation } from "../../../lib/studioLocation";
import { setAiTransport } from "../../aiWriter";
import { applyAdminLook } from "../../riso/adminLook";
import { startersData } from "../../platformStarters";
import { STARTER_SITES } from "../../lookGallery";
import { ShopSellsContext, ShopWordsContext } from "../../shopWords";
import { wordsFor } from "../../../../shared/shopSells";

// The fixture wears the admin's one look, as Studio does inside a shop's admin.
applyAdminLook();

// `?live=1` loads a snapshot of the published design (features/site/__fixtures__/liveDesign.json).
const live = new URLSearchParams(location.search).has("live")
  ? (await import("../../../features/site/__fixtures__/liveDesign.json")).default as any : null;
const fixture = createStudioFixture({
  ...(live ? { settings: { design: live.design, draftDesign: live.design } } : {}),
  // `?media=denied` behaves as if the media library's Firestore rules weren't deployed yet.
  mediaDenied: new URLSearchParams(location.search).get("media") === "denied",
});
// `?bookings=1` shows Studio as a shop that takes bookings sees it (the Book a time links in the header and footer).
// ── Starter websites (platform/starters, control-room/starterSites.js): `?starters=aurel-editorial*,juniper-catalogue`
// offers those starters in that order, a trailing * marks one New; the rest are hidden. None without it (every starter). ──
{
  const listed = (new URLSearchParams(location.search).get("starters") || "").split(",").filter(Boolean);
  const order = listed.map((id) => id.replace(/\*$/, ""));
  // `?hiddenStyles=aurel-editorial/sand` hides that style, as the control room's switch does.
  const hiddenStyles = (new URLSearchParams(location.search).get("hiddenStyles") || "").split(",").filter(Boolean);
  const choice = listed.length ? { order, hidden: [], fresh: listed.filter((id) => id.endsWith("*")).map((id) => id.slice(0, -1)), known: order, hiddenStyles }
    : hiddenStyles.length ? { order: STARTER_SITES, hidden: [], fresh: [], known: STARTER_SITES, hiddenStyles } : null;
  startersData.watch = (onChange) => { onChange(choice); return () => {}; };
}
if (new URLSearchParams(location.search).has("bookings")) fixture.settings.bookingsLive = true;
if (new URLSearchParams(location.search).has("events")) fixture.settings.eventsLive = true;
if (new URLSearchParams(location.search).has("classes")) fixture.settings.classesLive = true;
if (new URLSearchParams(location.search).has("support")) fixture.settings.givingLive = true;
if (new URLSearchParams(location.search).has("membership")) fixture.settings.membershipsLive = true;
if (new URLSearchParams(location.search).has("rentals")) fixture.settings.rentalsLive = true;
// Version history starts with the published design kept once (Studio › Theme actions › Version history).
fixture.versions = [{ id: "v-published", kind: "published", label: "Published 8 Oct 2026", createdAt: "2026-10-08T15:00:00.000Z", design: JSON.parse(JSON.stringify(fixture.settings.design)) }];
// `?olderStarter=aurel-editorial/sand` shows Studio for a shop that started from an older version of that starter (and
// changed its button corners), so Themes offers the new version (starterVersions.ts).
{
  const older = new URLSearchParams(location.search).get("olderStarter");
  if (older) {
    const [id, style] = older.split("/");
    const { applyLook } = await import("../themeSwitch");
    const { withStyle } = await import("../starterStyles");
    const { libraryLook } = await import("../../lookGallery");
    for (const key of ["design", "draftDesign"] as const) {
      const applied = applyLook(fixture.settings[key] || fixture.settings.design, withStyle(libraryLook(id), style));
      fixture.settings[key] = { ...applied, buttonRadius: 23, themeBase: { ...applied.themeBase, sig: "older", version: undefined } };
    }
  }
}
// `?sells=` is also the shop's own answer, so the preview reads it as the storefront does (admin/sells.ts withShopStartFor:
// a shop that sells no books shows no books menu).
const sellsAnswer = new URLSearchParams(location.search).get("sells");
if (sellsAnswer) fixture.settings.sells = sellsAnswer;
installFakeStudioApi(adminApi as any, fixture);
(window as any).__studioFixture = fixture;
// AI writing (3.0 phase 8): browser checks set `__studioFixture.aiAnswer(body) → { status, data }`; without it the
// shop behaves as if no AI key was saved. Every request is recorded like a save.
setAiTransport(async body => {
  fixture.calls.push({ method: "aiWrite", args: [body] } as any);
  const answer = (fixture as any).aiAnswer?.(body);
  return answer || { status: 412, data: { error: "Add an AI key first: Settings › General › AI writing assistant (a free Google AI key, or an OpenRouter key).", needsKey: true } };
});

// `?sells=clothing` shows Studio as a shop that doesn't sell books sees it (the admin's words, shopWords.tsx).
const sells = new URLSearchParams(location.search).get("sells");
const words = wordsFor(sells);
// `?night=1` shows Studio as the admin's night mode does (the same wrapper Dashboard.tsx puts around it).
const night = new URLSearchParams(location.search).has("night");

createRoot(document.getElementById("root")!).render(
  <ShopSellsContext.Provider value={sells}>
  <ShopWordsContext.Provider value={words}>
  <div className={`${night ? "" : "admin-light"} admin-reso`} data-admin-theme={night ? "dark" : "reso"} style={{ background: "transparent" }}>
    <div className="fixed inset-0 z-[200] bg-black">
      <StudioEditor settings={fixture.settings} appearance={night ? "dark" : "light"} initialLocation={parseStudioLocation(location.hash) || undefined} onExit={() => { (window as any).__studioExited = true; }} />
    </div>
  </div>
  </ShopWordsContext.Provider>
  </ShopSellsContext.Provider>,
);
