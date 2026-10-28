// The control room page (control-room/index.html): every shop with its plan, version, health and switches, an
// "Act as this shop" button and a switch for each feature. Plain browser JavaScript with no framework, like the
// sign-up page. The server (control-room/routes.js) checks that the person is a platform admin, and asks for a reason
// that goes in the shop's log.
import { API_BASE, FIREBASE_SDK, PLATFORM_FIREBASE } from "../signup/config.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup } = await import(`${FIREBASE_SDK}/firebase-auth.js`);

const auth = getAuth(initializeApp(PLATFORM_FIREBASE));
const $ = (selector) => document.querySelector(selector);
const status = $("#status");

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
}

async function api(method, path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : "";
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const answer = await response.json().catch(() => ({ ok: false, message: "The platform didn't answer. Try again." }));
  if (!response.ok || answer.ok === false) throw new Error(answer.message || "Something went wrong.");
  return answer;
}

const askWhy = (what) => (window.prompt(`${what}\n\nWhy? This goes in the shop's log (at least 10 characters).`) ?? "").trim();
const LEVEL = { problem: "Problem", watch: "Look", ok: "OK" };
const SWITCH_WORDS = {
  legacyStockroomSignIn: "Old stockroom sign-in",
  githubPagesForwarding: "Forward the old GitHub Pages address",
  gmailReceiptFinder: "Find receipts in Gmail",
  gmailOrderScan: "Scan Gmail for order receipts",
};

async function load() {
  status.textContent = "Loading…";
  try {
    const { shops } = await api("GET", "/control/shops");
    const problems = shops.filter((s) => s.health.level === "problem").length;
    $("#summary").textContent = `${shops.length} shops · ${problems} with a problem`;
    $("#shops").replaceChildren(...(shops.length ? shops.map(card) : [el("p", { textContent: "No shops yet." })]));
    status.textContent = "";
    $("#view-signin").hidden = true;
    $("#view-shops").hidden = false;
  } catch (failure) {
    status.textContent = failure.message;
  }
}

function card(shop) {
  const act = el("button", { type: "button", textContent: "Act as this shop", disabled: shop.status !== "live" });
  act.addEventListener("click", async () => {
    const reason = askWhy(`Open ${shop.pressName}'s admin as support for 30 minutes.`);
    if (!reason) return;
    act.disabled = true;
    try {
      const { url } = await api("POST", "/control/act-as", { shopId: shop.shopId, reason });
      window.open(url, "_blank", "noopener");
      status.textContent = `Logged. ${shop.pressName}'s admin opened in a new tab.`;
    } catch (failure) {
      status.textContent = failure.message;
    }
    act.disabled = false;
  });

  const switches = shop.switches
    ? el("div", { className: "row" }, ...Object.entries(shop.switches).map(([name, on]) => {
      const box = el("input", { type: "checkbox", checked: on });
      box.addEventListener("change", async () => {
        const reason = askWhy(`Turn "${SWITCH_WORDS[name] ?? name}" ${box.checked ? "on" : "off"} for ${shop.pressName}. Its pages are deployed again.`);
        if (!reason) { box.checked = !box.checked; return; }
        box.disabled = true;
        try {
          await api("POST", "/control/switch", { shopId: shop.shopId, name, on: box.checked, reason });
          status.textContent = `${SWITCH_WORDS[name] ?? name} is ${box.checked ? "on" : "off"} for ${shop.pressName}.`;
        } catch (failure) {
          box.checked = !box.checked;
          status.textContent = failure.message;
        }
        box.disabled = false;
      });
      return el("label", { className: "switch" }, box, SWITCH_WORDS[name] ?? name);
    }))
    : null;

  return el("div", { className: `card ${shop.health.level}` },
    el("div", { className: "row" }, el("strong", { textContent: shop.pressName }), el("span", { className: "pill", textContent: LEVEL[shop.health.level] }), act),
    el("div", { className: "facts" },
      el("span", { textContent: shop.shopId }),
      el("span", { textContent: `plan: ${shop.plan ?? "?"}` }),
      el("span", { textContent: `version: ${shop.version ?? "none yet"}` }),
      el("span", { textContent: `status: ${shop.status ?? "?"}` }),
      shop.access ? el("span", { textContent: `billing: ${shop.access}` }) : null,
      shop.testShop ? el("span", { textContent: "test shop" }) : null),
    shop.health.reasons.length ? el("ul", {}, ...shop.health.reasons.map((reason) => el("li", { textContent: reason }))) : null,
    switches);
}

$("#google").addEventListener("click", () => signInWithPopup(auth, new GoogleAuthProvider()).catch(() => { status.textContent = "Sign-in didn't finish."; }));
$("#refresh").addEventListener("click", load);
onAuthStateChanged(auth, (user) => {
  if (user) load();
  else { $("#view-signin").hidden = false; $("#view-shops").hidden = true; }
});
