# Social service

Connects a press's Facebook & Instagram, Pinterest and TikTok, sends its catalog and publishes its posts (code plan
Phase 27). Design, doors and rules: `docs/social.md`. Plain Node 22 ES modules with an injected `fetch`; tests use the
pretend networks in `fakes.js`. **Off unless `SOCIAL_ENABLED=true`.**

- `social.js`: `createSocialService(...)`: status, connect, catalogs, publish, disconnect, sign-in answers, `controlRoom`.
- `networks.js`: the Meta, Pinterest and TikTok clients. `endpoints.js`: every address and scope, with where each was confirmed.
- `config.js`: the environment. `http.js`: `handleSocial`. `index.js`: `createSocialFromEnv`.
- `hosted.js`: `hostedSocial`, the stores in the platform's database and the default sign-in address (server/world.js, `/api/social`).
- `fakes.js`, `social.test.js`.
