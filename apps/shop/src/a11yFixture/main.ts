// Development-only entry for a11y-fixture.html (plan 8.8): the real storefront under one theme from the library, the
// way Studio's preview shows it, so scripts/a11y-check.mjs can run an accessibility check over every theme.
//
//   /a11y-fixture.html?theme=<theme id>&path=/books/salt-hours
//
// The theme is applied as Studio's Apply does it (themedDesign); the sample books and the design go in through the
// preview snapshot (useSiteData reads it), then the address becomes `path?preview=true` and the shop's own entry runs.
// The check answers every request for shop data with nothing, so only these books show.
import { THEME_LIBRARY } from "../app/admin/studio/themeLibrary";
import { themedDesign } from "../app/admin/studio/themeLook";
import { defaultSettings } from "../app/admin/defaultSettings";
import { A11Y_BOOKS } from "./books";

export const STARTING_LOOK = "starting-look";

const params = new URLSearchParams(location.search);
const themeId = params.get("theme") || STARTING_LOOK;
const base = defaultSettings().design;
const theme = (THEME_LIBRARY as any[]).find(t => t.id === themeId);
if (themeId !== STARTING_LOOK && !theme) throw new Error(`No theme called ${themeId} in the library`);
const design = theme ? themedDesign(theme, base) : base;

const win = window as any;
win.__studioPreviewDesign = design;
win.__studioPreviewState = { settings: { design }, books: A11Y_BOOKS, pages: [] };
win.__studioPreviewStatus = "live";
win.__a11yThemes = [STARTING_LOOK, ...(THEME_LIBRARY as any[]).map(t => t.id)];

const path = params.get("path") || "/";
history.replaceState(null, "", `${path.startsWith("/") ? path : `/${path}`}?preview=true`);
await import("../main");
