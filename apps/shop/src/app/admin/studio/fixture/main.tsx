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
// Version history starts with the published design kept once (Studio › Theme actions › Version history).
fixture.versions = [{ id: "v-published", kind: "published", label: "Published 8 Oct 2026", createdAt: "2026-10-08T15:00:00.000Z", design: JSON.parse(JSON.stringify(fixture.settings.design)) }];
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
