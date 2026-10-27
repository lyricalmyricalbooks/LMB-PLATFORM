# App copies

Copies of the shop and the stockroom, made on 27 October 2026, for the platform to change freely.

| Folder | Copied from | At commit |
| --- | --- | --- |
| `shop/` | `lyricalmyricalbooks/LyricalmyricalWebsite` (main) | `e06d182` |
| `stockroom/` | `lyricalmyricalbooks/lyrical-inventory` (main) | `f8c896a` |

**Julian's own website and stockroom are never changed for the platform.** Those two repos stay specific to
Lyricalmyrical and must keep working in all circumstances. Product work happens only here.

To keep the copies away from the live shop:

- Every live project id, web key and app id was replaced with a made-up test project (`lmb-test-shop`,
  `lmb-test-stockroom`), and there is no `.firebaserc`, so no deploy can pick a project by itself.
- `apps-isolation.test.js` at the repo root fails if any of those live values comes back.
- The workflows under each copy's `.github/` never run (GitHub only runs the repo root's). They are kept because the
  copies' own tests read them. Only the root `.github/workflows/ci.yml` runs, and it only tests.

Each copy keeps its own tools: the shop uses pnpm, the stockroom npm. Run their checks from their folder.
