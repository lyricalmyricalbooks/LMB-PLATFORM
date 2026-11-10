// The designer before a store exists (/design/studio; beforeShop.ts says why). Signs in with the platform's own account
// as the front door does (same site, same Firebase project), opens the press's setup record, and shows the real Studio
// with sample products in the press's own kind. Every save goes to the press's record (`design`); nothing here reads or
// writes a shop database, because there is none yet. Done goes back to the front door, which starts the store.
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import "../styles/adminCompat.css";
import { adminApi } from "../app/admin/api";
import { mediaApi } from "../app/admin/mediaApi";
import { setThemeBackend } from "../app/admin/themeStore";
import { StudioEditor } from "../app/admin/studio/StudioEditor";
import { createStudioFixture, installFakeStudioApi } from "../app/admin/studio/fixture/fakeStudioApi";
import { ShopWordsContext } from "../app/admin/shopWords";
import { adminWordsFor } from "../app/admin/sells";
import { DEFAULT_SETTINGS } from "../app/features/site/constants";
import { platformDoor, type SetupPress } from "../setupMode/door";
import { WITH_YOUR_STORE, beforeShopBackend, designerReturn, sampleShopBooks, startingDesign } from "./beforeShop";

const FRONT_DOOR = "/join/";
const load = (path: string) => import(/* @vite-ignore */ new URL(path, location.origin).href);

function say(words: string) {
  const root = document.getElementById("root");
  if (!root) return;
  const line = document.createElement("p");
  line.setAttribute("role", "status");
  line.textContent = words;
  root.replaceChildren(line);
}

/** Parts of Studio that need a real store (pictures in storage, share links, schedules) say so in plain words. */
function withoutStore(api: Record<string, any>) {
  const later = async () => { throw new Error(WITH_YOUR_STORE); };
  for (const name of ["uploadFile", "createPreviewLink", "addThemeSchedule", "createPage", "updatePage", "deletePage", "saveRedirects", "updateCategoryBooks", "updateShopCategories"]) api[name] = later;
  (mediaApi as Record<string, any>).save = later;
}

async function start() {
  const config = await load("/signup/config.js");
  const { initializeApp } = await import(/* @vite-ignore */ `${config.FIREBASE_SDK}/firebase-app.js`);
  const { getAuth, onAuthStateChanged } = await import(/* @vite-ignore */ `${config.FIREBASE_SDK}/firebase-auth.js`);
  const auth = getAuth(initializeApp(config.PLATFORM_FIREBASE));
  const user = await new Promise<any>((resolve) => { const stop = onAuthStateChanged(auth, (u: any) => { stop(); resolve(u); }); });
  if (!user) return location.replace(FRONT_DOOR);

  const door = platformDoor(config.API_BASE, () => user.getIdToken());
  const wanted = new URLSearchParams(location.search).get("press");
  const presses = await door.presses();
  const press: SetupPress | undefined = wanted ? presses.find((p) => p.pressId === wanted) : presses.find((p) => p.status === "setup");
  // A store that exists (or is being made) is designed from its own admin; the front door knows the way there.
  if (!press || press.status !== "setup") return location.replace(FRONT_DOOR);

  const base = (DEFAULT_SETTINGS as any).design || {};
  const design = startingDesign(press, base);
  const name = press.pressName || "";
  const fixture = createStudioFixture({
    settings: { ...DEFAULT_SETTINGS, ...(name ? { info: { ...(DEFAULT_SETTINGS as any).info, name } } : {}), design, draftDesign: design },
    books: sampleShopBooks(press.sells), pages: [], media: [],
  });
  installFakeStudioApi(adminApi as any, fixture);
  withoutStore(adminApi as any);
  setThemeBackend(beforeShopBackend(door, press.pressId, design));

  const back = designerReturn(press.pressId);
  createRoot(document.getElementById("root")!).render(
    <ShopWordsContext.Provider value={adminWordsFor(press.sells || null)}>
      <div className="admin-light admin-reso" data-admin-theme="reso" style={{ background: "transparent" }}>
        <div className="fixed inset-0 z-[200] bg-black">
          <StudioEditor beforeShop settings={fixture.settings} appearance="light" onExit={() => location.assign(back)} />
        </div>
      </div>
    </ShopWordsContext.Provider>,
  );
}

start().catch((error) => {
  console.error(error);
  say("We couldn't open the designer. Check your connection and reload the page.");
});
