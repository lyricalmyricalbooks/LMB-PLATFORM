// This browser's device id for new-device alerts (accounts/devices.js): made once and kept in the browser, sent with
// every signed-in call as `X-Device-Id`. It is random and says nothing about the person. When the browser can't keep it
// (a private window, blocked storage), the id lasts for this page only, so the server may see a new device next time.
const KEY = "colophon.device";
let current = "";

export function deviceId() {
  if (current) return current;
  try {
    current = localStorage.getItem(KEY) || "";
  } catch {}
  if (!/^[A-Za-z0-9-]{16,64}$/.test(current)) {
    current = crypto.randomUUID();
    try {
      localStorage.setItem(KEY, current);
    } catch {}
  }
  return current;
}
