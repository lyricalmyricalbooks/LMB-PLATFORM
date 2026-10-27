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

createRoot(document.getElementById("root")!).render(
  <div className="admin-light admin-reso" data-admin-theme="reso" style={{ background: "transparent" }}>
    <div className="fixed inset-0 z-[200] bg-black">
      <StudioEditor settings={fixture.settings} appearance="light" initialLocation={parseStudioLocation(location.hash) || undefined} onExit={() => { (window as any).__studioExited = true; }} />
    </div>
  </div>,
);
