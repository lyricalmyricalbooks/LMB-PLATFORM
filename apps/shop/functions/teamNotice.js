// Tells the platform that Settings › Team changed (code plan 5.11), so the people on the team see this shop in the
// platform's account switcher, and someone removed here stops seeing it there.
//
//   POST <PLATFORM_ACCOUNTS_URL>/team-changed   headers X-Shop-Id: <project id>, Authorization: Bearer <PLATFORM_SERVICE_KEY>
//
// The call carries nothing about the team: the platform re-reads this shop's own members list itself (LMB-PLATFORM
// accounts/teamSync.js), so a notice can never add anyone to another shop. It never throws: the Team change is already
// saved and the sign-in pass already updated; a missed notice is caught up by the platform's own sync.

async function tellPlatformTeamChanged({ url, shopId, serviceKey, fetch = globalThis.fetch, timeoutMs = 10000 }) {
  if (!/^https:\/\/[^\s]+$/.test(String(url || ""))) return { ok: false, reason: "no platform address" };
  const key = String((typeof serviceKey === "function" ? serviceKey() : "") || "").trim();
  if (!key) return { ok: false, reason: "no platform key yet" };
  try {
    const response = await fetch(`${String(url).replace(/\/+$/, "")}/team-changed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shop-Id": shopId, Authorization: `Bearer ${key}` },
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? { ok: true } : { ok: false, reason: `the platform answered ${response.status}` };
  } catch (err) {
    return { ok: false, reason: `the platform didn't answer (${err?.message || err})` };
  }
}

module.exports = { tellPlatformTeamChanged };
