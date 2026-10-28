# Demo shop

`npm run demo` runs the platform's test shop on one computer. It uses the Firebase Local Emulator Suite, with the
made-up project `demo-colophon-test`. The plain-words guide for the owner is [docs/demo-shop.md](../docs/demo-shop.md).

| File | What it does |
| --- | --- |
| `run.js` | The command. It checks Node and Java, installs packages the first time, writes `.demo/`, starts the emulators, seeds them, starts both apps and prints the addresses. Ctrl+C stops everything and saves the shop's and the stockroom's data. |
| `config.js` | The fixed settings: project, ports, demo owner, both shop profiles, the emulator config and the rules filled in for the demo owner. |
| `keepDatabase.js` | Saves the stockroom's own Firestore database to `.demo/stockroom-data.json` (every few seconds and at Ctrl+C) and writes it back on the next start: the emulators' export keeps only the default database. |
| `keep-check.js` | The CI check for that against the real emulators: start, write to the stockroom, Ctrl+C, start again, find it. |
| `seed.js` | Fills the emulators: the test catalogue (`setup/test-catalogue.js`) with covers, the settings, the Team entry, the stockroom's books, and the demo owner with the `owner` role. Safe to run again. |
| `serve.js` | Starts one app's own Vite with the demo profile at `/shop-profile.js`. |
| `photos.js` | The placeholder covers. |
| `hosted.js` | The sample press (`npm run demo -- --sample-press <host>`): read-only rules, no server code, the notice bar, what the gate refuses, the nightly reset time. |
| `gate.js` | The sample press's only public door: serves the built apps and passes requests to the emulators, refusing their back doors. |
| `reset.js` | The sample press's nightly fresh start: clears everything and seeds again. `node demo/reset.js` runs it once. |
| `fakeEmulators.js` | The pretend emulators the tests use. |

Plain Node 22 ES modules with no packages of their own. Tests: `demo/demo.test.js`, `demo/sample-press.test.js` and `demo/keepDatabase.test.js` (root `npm test`). They use a
pretend emulator, so they never start the real one.
