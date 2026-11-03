// "Keep it" from the reminder email (accounts/keep.html, /account/keep.html?shop=<id>&t=<one-time link>): one press keeps
// the app the plan change would close, with no sign-in. The server checks the link (services/billing/closedApps.js): it
// works once, for that closing only, until the app closes. Nothing happens on opening the page, so an email scanner that
// opens links keeps nothing.
import { API_BASE } from "../signup/config.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const shopId = params.get("shop") ?? "";
const token = params.get("t") ?? "";
const status = $("#status");
$("#plan-link").href = shopId ? `/account/billing?shop=${encodeURIComponent(shopId)}` : "/account/";

// The link stays in this page only: out of the address bar, so it isn't kept in history or copied by mistake.
if (token) history.replaceState(null, "", `${location.pathname}?shop=${encodeURIComponent(shopId)}`);

if (!shopId || !token) {
  $("#keep").hidden = true;
  status.textContent = "This link is missing a part. Sign in and open Plan & billing to keep it.";
}

$("#keep").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = "Keeping it…";
  try {
    const response = await fetch(`${API_BASE}/billing/keep-by-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, token }),
    });
    const answer = await response.json().catch(() => ({ ok: false, message: "We couldn't reach Colophon. Check your connection and try again." }));
    if (!response.ok || answer.ok === false) {
      // A link that is used, out of date or wrong won't work on a second press either.
      if (response.status === 404 || response.status === 410) button.hidden = true;
      throw new Error(answer.message || "Something went wrong.");
    }
    button.hidden = true;
    $("#keep-words").textContent = "Kept. Nothing closes, and your plan is back to what it was. We've emailed you the details.";
    status.textContent = "";
  } catch (failure) {
    status.textContent = failure.message;
    button.disabled = false;
  }
});
