// Runs in the owner's admin (combined admin only): keeps the fair helpers' till menu current and brings the sales they
// ring up into the records (fairInbox.ts). Quiet: a sale that can't come in now waits for the next look.
import { useEffect } from "react";
import type { HelperSale } from "@stockroom/fair-helper.js";

import { bringIn, localUnfinished, menuFrom, setStuck, type InboxIO } from "./fairInbox";
import { fairStore } from "./fairStore";
import { stockroomApi } from "./stockroomData";
import { onStockroomSaved, stockroomWriteApi } from "./stockroomWrite";

const MENU_WAIT_MS = 4000;
const LOOK_EVERY_MS = 20_000;

const liveIO: InboxIO = {
  load: () => stockroomApi.load(),
  claim: (id) => fairStore.claim(id),
  saveBook: (id, mutate) => stockroomWriteApi.saveBookState(id, mutate),
  unfinished: localUnfinished,
};

export function FairHelperInbox({ io = liveIO, store = fairStore }: { io?: InboxIO; store?: Pick<typeof fairStore, "watchSales" | "writeMenu"> }) {
  useEffect(() => {
    let stopped = false;
    let lastMenu = "";
    let menuTimer = 0;
    let sales: HelperSale[] = [];
    let looking = false;
    let again = false;

    const publishMenu = async () => {
      try {
        const menu = menuFrom(await io.load(), new Date().toISOString());
        const key = JSON.stringify(menu.books);
        if (key === lastMenu || stopped) return;
        await store.writeMenu(menu);
        lastMenu = key;
      } catch (e) { console.warn("Fair helper menu: not saved", e); }
    };
    const scheduleMenu = (wait = MENU_WAIT_MS) => { window.clearTimeout(menuTimer); menuTimer = window.setTimeout(() => void publishMenu(), wait); };

    const look = async () => {
      if (looking) { again = true; return; }
      looking = true;
      try {
        const result = await bringIn(sales, io);
        setStuck(result.stuck);
        if (result.brought) scheduleMenu();
      } catch (e) { console.warn("Fair helper sales: could not bring in", e); }
      finally {
        looking = false;
        if (again && !stopped) { again = false; void look(); }
      }
    };

    scheduleMenu(0);
    const stopSaved = onStockroomSaved(() => scheduleMenu());
    const stopWatch = store.watchSales((docs) => { sales = docs; void look(); }, (e) => console.warn("Fair helper sales: not watched", e));
    // A sale is brought in once its Undo has passed, so look again a little later.
    const timer = window.setInterval(() => { if (sales.length) void look(); }, LOOK_EVERY_MS);
    const online = () => { scheduleMenu(0); void look(); };
    window.addEventListener("online", online);
    return () => { stopped = true; stopSaved(); stopWatch(); window.clearInterval(timer); window.clearTimeout(menuTimer); window.removeEventListener("online", online); };
  }, []);
  return null;
}
