// The server's own Google access token, from the Cloud Run metadata server: the token of the service's own account
// (platform-api or platform-jobs), so no key file exists anywhere. From Google's "Fetching identity and access tokens"
// for Cloud Run:
//
//   GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
//       header Metadata-Flavor: Google   ->  { access_token, expires_in, token_type: "Bearer" }
//
// The token is kept until a minute before it runs out; callers sharing one `token()` share one fetch.
export const METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const EARLY_MS = 60_000;

export function metadataToken({ fetch, now = () => Date.now(), url = METADATA_TOKEN }) {
  if (typeof fetch !== "function") throw new Error("the token needs a fetch");
  let held = null; // { token, until }
  let pending = null;

  async function load() {
    const response = await fetch(url, { method: "GET", headers: { "Metadata-Flavor": "Google" } });
    if (!response.ok) throw new Error(`the metadata server answered ${response.status}: this only works on Google Cloud`);
    const body = await response.json();
    if (typeof body?.access_token !== "string" || !body.access_token) throw new Error("the metadata server gave no token");
    const seconds = Number.isFinite(body.expires_in) ? body.expires_in : 300;
    held = { token: body.access_token, until: now() + seconds * 1000 - EARLY_MS };
    return held.token;
  }

  return async function token() {
    if (held && now() < held.until) return held.token;
    pending ??= load().finally(() => { pending = null; });
    return pending;
  };
}
