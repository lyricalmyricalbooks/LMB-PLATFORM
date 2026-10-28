# Demo shop

`npm run demo` runs the platform's test shop on one computer. It uses the Firebase Local Emulator Suite, with the
made-up project `demo-colophon-test`. The plain-words guide for the owner is [docs/demo-shop.md](../docs/demo-shop.md).

| File | What it does |
| --- | --- |
| `run.js` | The command. It checks Node and Java, installs packages the first time, writes `.demo/`, starts the emulators, seeds them, starts both apps and prints the addresses. Ctrl+C stops everything and saves the shop's data. |
| `config.js` | The fixed settings: project, ports, demo owner, both shop profiles, the emulator config and the rules filled in for the demo owner. |
| `seed.js` | Fills the emulators: the test catalogue (`setup/test-catalogue.js`) with covers, the settings, the Team entry, the stockroom's books, and the demo owner with the `owner` role. Safe to run again. |
| `serve.js` | Starts one app's own Vite with the demo profile at `/shop-profile.js`. |
| `photos.js` | The placeholder covers. |

Plain Node 22 ES modules with no packages of their own. Tests: `demo/demo.test.js` (root `npm test`). They use a
pretend emulator, so they never start the real one.
