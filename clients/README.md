# Clients

The platform's real connections to Google, built so that tests never reach Google. Every client takes an injected
`fetch` and an injected `token()` (an OAuth access token for the platform's account), and is tested with a fake `fetch`
(`fake-fetch.js`) that checks each request's method, address, body and token. No key file and no secret is read here.

Endpoints come from Google's discovery documents (`https://<api>.googleapis.com/$discovery/rest?version=<v>`), which
list every method's exact path and fields. Each file names the ones it uses.

| File | What it does |
| --- | --- |
| `http.js` | One way to call Google: token header, JSON, Google's own error message, long-running operations. |
| `firestore.js` | Read, create, update, delete, query and transactions on one database (a shop's, the stockroom's named one, or the platform's). |
| `registry.js` | The shop registry (platform project) and a shop's audit log, the same shape as `setup/fakes.js`. |
| `identity.js` | Signs the test shop's owner in for the release check (custom token signed through IAM). Refuses every other shop. |
