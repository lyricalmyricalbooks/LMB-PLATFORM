# Starter photos

The photos in these folders belong to the starter websites' made-up sample shops (`THEME_LIBRARY` in
`src/app/admin/studio/themeLibrary.ts`). They were made for the platform with Figma's AI image generation, one matching
set per starter, so they carry no outside licence and never show a real brand or person. `thumbs/` holds the "Choose your
website" pictures (`scripts/starter-thumbs.mjs`).

| Folder | Starter | Made |
| --- | --- | --- |
| aurel/ | Aurel (Atelier Ondine) | 24 November 2026 |
| slow-season/ | Slow Season (Fallow House) | 24 November 2026 |
| catalogue/ | Catalogue (Margin Editions) | 26 November 2026 |
| gallery/ | Gallery (Stillwater Ceramics) | 26 November 2026 |
| warehouse/ | Warehouse (Northline Supply) | 26 November 2026 |
| larder/ | Larder (Rye & Salt) | 26 November 2026 |
| commission/ | Commission (Hollis & Pine Joinery) | 26 November 2026 |

Every sample product has a second photo, `<name>-2.jpg` (a close-up or the product in use, made 26 November 2026 in the
same light as its first), listed as `morePhotos`; `sampleShops.test.ts` checks every file exists. Keep each product photo under about 150 KB (an opening photo under about 260 KB). Salon and Workshop use the licensed
sample sets in `public/samples/` (see its LICENSE.md).
