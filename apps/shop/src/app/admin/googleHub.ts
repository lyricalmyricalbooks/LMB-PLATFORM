// Settings › Google: every Google service a press can link, as cards (pure; GoogleSettings.tsx draws them). One sign-in
// with the press's Google account links the "included" parts (plan 6.17, googleConnect.ts); the extras are optional and
// ticked here before Google's page asks for them. Each card says what the service does, how its link is going, and
// where to go next, in the press's words. Nothing here reaches Google: the state comes from the platform's status answer.
import { GOOGLE_PARTS, type GoogleExtra, type GoogleStatus } from "./googleConnect";

export type ServiceId = "analytics" | "searchConsole" | "merchantCenter" | "email" | "domain" | GoogleExtra;
/** coming: not switched on yet · ready: switched on, Google not connected yet · off: not linked · linking: just
 * connected, Google is still answering. */
export type ServiceState = "coming" | "ready" | "off" | "linking" | "done" | "waiting" | "failed";

export type ServiceInfo = {
  /** What the press gets, two short lines. */
  gives: [string, string];
  /** The service's own page at Google, to look at it there. */
  googleUrl?: string;
  /** The admin page that uses it (an admin address), and the button's words. */
  admin?: { hash: string; label: string };
};

/** The parts every sign-in links, in the order a press cares about them. */
export const INCLUDED: ServiceId[] = ["analytics", "searchConsole", "merchantCenter", "email", "domain"];
/** The optional extras, in the order they are offered. */
export const EXTRAS: GoogleExtra[] = ["businessProfile", "drive", "youtube", "calendar", "ads"];

export const SERVICE_INFO: Record<ServiceId, ServiceInfo> = {
  analytics: { gives: ["Where your visitors come from", "Google's visit figures on your Home page"], googleUrl: "https://analytics.google.com/", admin: { hash: "#overview", label: "See your figures" } },
  searchConsole: { gives: ["Your shop and books sent to Google search", "The words people searched to find you"], googleUrl: "https://search.google.com/search-console" },
  merchantCenter: { gives: ["Your books in Google Shopping's free listings, every day", "A list of any book Google turned down, with the fix"], googleUrl: "https://merchants.google.com/" },
  email: { gives: ["Order emails sent from your own address", "Replies land in your own inbox"], admin: { hash: "#settings/notifications", label: "Open Email sender" } },
  domain: { gives: ["Your own web address counted with your shop", "Search results show your address"], admin: { hash: "#settings/general/details", label: "Open your web address" } },
  businessProfile: { gives: ["Your opening hours and shop link on Google Maps", "Shows up when people search your press's name"], googleUrl: "https://business.google.com/" },
  drive: { gives: ["A copy of your shop each night, in a folder you own", "Your stock list in a Google Sheet"], googleUrl: "https://drive.google.com/" },
  youtube: { gives: ["Pick trailers from your channel for your book pages", "No copying links by hand"], googleUrl: "https://studio.youtube.com/" },
  calendar: { gives: ["Launches and fairs from your calendar", "Shown on your website's events"], googleUrl: "https://calendar.google.com/" },
  ads: { gives: ["Advertise your books on Google", "Nothing is spent unless you start an ad yourself"], googleUrl: "https://ads.google.com/" },
};

export type ServiceView = {
  id: ServiceId;
  label: string;
  about: string;
  gives: [string, string];
  state: ServiceState;
  /** Google's own line about how it went, when it sent one. */
  detail: string;
  /** An extra the press has ticked (saved, or ticked here and not yet saved). */
  picked?: boolean;
  /** The press can ask for this part again (it didn't work or is waiting; the web address follows its own page). */
  canRetry: boolean;
  googleUrl?: string;
  admin?: { hash: string; label: string };
};

const stepFor = (status: GoogleStatus, id: string) => (status.steps ?? []).find((s) => s.step === id);

function stateOf(status: GoogleStatus, id: ServiceId, isExtra: boolean, picked: boolean): { state: ServiceState; detail: string } {
  if (!status.enabled) return { state: "coming", detail: "" };
  if (!status.connected) return { state: "ready", detail: "" };
  if (isExtra && !(status.extrasChosen ?? []).includes(id as GoogleExtra)) return { state: "off", detail: "" };
  const step = stepFor(status, id);
  if (step) return { state: step.state, detail: step.detail };
  // Connected, nothing back for this part yet: Google is still answering (no parts at all), or the press unticked it.
  if ((status.steps ?? []).length === 0 || isExtra) return { state: picked ? "linking" : "off", detail: "" };
  return { state: "off", detail: "Not linked. It may have been unticked on Google's page." };
}

/** Every card for the page. `picked` is the press's current ticks for the extras (defaults to what is saved). */
export function googleServices(status: GoogleStatus, picked: GoogleExtra[] = status.extrasChosen ?? []): { included: ServiceView[]; extras: ServiceView[] } {
  const offered = status.enabled && (status.extrasOffered ?? []).length > 0 ? status.extrasOffered! : EXTRAS;
  const view = (id: ServiceId, isExtra: boolean): ServiceView => {
    const pick = isExtra ? picked.includes(id as GoogleExtra) : true;
    const { state, detail } = stateOf(status, id, isExtra, pick);
    return {
      id, label: GOOGLE_PARTS[id]?.label ?? id, about: GOOGLE_PARTS[id]?.about ?? "", ...SERVICE_INFO[id],
      state, detail, ...(isExtra ? { picked: pick } : {}),
      canRetry: !!status.connected && id !== "domain" && (state === "failed" || state === "waiting"),
    };
  };
  return {
    included: INCLUDED.map((id) => view(id, false)),
    extras: EXTRAS.filter((id) => offered.includes(id)).map((id) => view(id, true)),
  };
}

/** The badge for a card: tone and words. */
export function serviceBadge(view: Pick<ServiceView, "state" | "picked">): { tone: "neutral" | "success" | "warning" | "danger" | "info"; text: string } {
  switch (view.state) {
    case "coming": return { tone: "neutral", text: "Coming soon" };
    case "done": return { tone: "success", text: "Working" };
    case "waiting": return { tone: "warning", text: "Waiting on Google" };
    case "failed": return { tone: "danger", text: "Didn't work" };
    case "linking": return { tone: "info", text: "Linking…" };
    case "ready": return view.picked === undefined ? { tone: "neutral", text: "Ready to link" } : view.picked ? { tone: "info", text: "On" } : { tone: "neutral", text: "Off" };
    default: return view.picked === undefined ? { tone: "neutral", text: "Not linked" } : view.picked ? { tone: "info", text: "On, not saved" } : { tone: "neutral", text: "Off" };
  }
}

/** The page's headline count: how many of the press's chosen services work, and which need a look. */
export function googleSummary(status: GoogleStatus, services: { included: ServiceView[]; extras: ServiceView[] }) {
  const chosen = [...services.included, ...services.extras.filter((e) => (status.extrasChosen ?? []).includes(e.id as GoogleExtra))];
  const working = chosen.filter((s) => s.state === "done").length;
  const needsYou = chosen.filter((s) => s.state === "failed" || s.state === "waiting").length;
  return { working, total: chosen.length, needsYou, segments: chosen.map((s) => ({ id: s.id, label: s.label, state: s.state })) };
}

/** Ticks that differ from what is saved with Google (order doesn't matter). */
export function extrasChanged(saved: GoogleExtra[] = [], picked: GoogleExtra[] = []): { added: GoogleExtra[]; removed: GoogleExtra[] } {
  return { added: picked.filter((e) => !saved.includes(e)), removed: saved.filter((e) => !picked.includes(e)) };
}
