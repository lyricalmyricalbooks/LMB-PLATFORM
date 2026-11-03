// The entry of setup mode (code plan 18.6), served by the platform at /app/. It signs in with the platform's own
// account (the front door's sign-in carries over: same site, same Firebase project), opens the press's setup record
// and shows the admin in setup mode. It never loads the shop's Firebase project: there is no shop yet.
//
// The platform's sign-in settings and its lists (countries, what you sell) are read from the platform site itself
// (/signup/config.js, /signup/form.js), so there is one copy of each and the walkthrough's practice sign-in works here too.
import { createRoot } from "react-dom/client";
import "../styles/index.css";
import { SetupAdmin, type SetupLists } from "./SetupAdmin";
import { platformDoor, pressToOpen } from "./door";

const FRONT_DOOR = "/join/";
const ACCOUNT_PAGE = "/account/";
const HELP_PAGE = "/help/";

const load = (path: string) => import(/* @vite-ignore */ new URL(path, location.origin).href);

function say(words: string) {
  const root = document.getElementById("root");
  if (root) root.textContent = words;
}

async function start() {
  const [config, form] = await Promise.all([load("/signup/config.js"), load("/signup/form.js")]);
  const { initializeApp } = await import(/* @vite-ignore */ `${config.FIREBASE_SDK}/firebase-app.js`);
  const { getAuth, onAuthStateChanged, signOut } = await import(/* @vite-ignore */ `${config.FIREBASE_SDK}/firebase-auth.js`);
  const auth = getAuth(initializeApp(config.PLATFORM_FIREBASE));
  const user = await new Promise<any>((resolve) => { const stop = onAuthStateChanged(auth, (u: any) => { stop(); resolve(u); }); });
  if (!user) return location.replace(FRONT_DOOR);

  const door = platformDoor(config.API_BASE, () => user.getIdToken());
  const presses = await door.presses();
  const press = pressToOpen(presses, new URLSearchParams(location.search).get("press"));
  // No press in setup: an opened one is run from the account page; none at all starts at the front door.
  if (!press) return location.replace(presses.some((p) => p.status === "opening" || p.status === "open") ? ACCOUNT_PAGE : FRONT_DOOR);
  if (press.status === "opening" || press.status === "open") return location.replace(ACCOUNT_PAGE);

  const lists: SetupLists = {
    countries: form.COUNTRIES,
    sells: form.PUBLISHES.options.map((o: { id: string; label: string }) => ({ id: o.id, label: o.label })),
  };
  createRoot(document.getElementById("root")!).render(
    <SetupAdmin press={press} door={door} lists={lists} email={user.email ?? ""} helpUrl={HELP_PAGE}
      onSignOut={() => { void signOut(auth).then(() => location.replace(FRONT_DOOR)); }} />,
  );
}

start().catch((error) => {
  console.error(error);
  say("We couldn't open your setup. Check your connection and reload the page.");
});
