# Catalog SEO review — 6 October 2026

Eight public records were reviewed against their actual fields and six distinct
image assets. Updates used the authenticated owner Firebase connection, masks
limited to SEO/copy/photo fields, and document update-time preconditions.

| Record ID | Listing | Search indexing | Description before |
| --- | --- | --- | --- |
| 0Jpsj0tPFRj0mztWugHN | sss (Copy) (Copy) | Excluded: test/duplicate | Empty |
| 35go3RBtXRJDwV2Czqqo | sss | Excluded: placeholder title/images | Empty |
| CMXnLjq4JIwyDkm3nlwN | Antigravity Test Book | Excluded: explicit test record | Missing |
| DRJqOeYalBPjRSXNt70o | test | Excluded: explicit test title/placeholder blurb | dggggggggg |
| ENpSJb2KN55gQATMY8vW | Altrove (Copy) | Excluded: duplicate | ffffffff |
| ZjixXdeKLnsnVkZhHMvF | Altrove (Copy) | Excluded: duplicate | ffffffff |
| o2biTvudbbRdCLwlfrKo | Altrove | Indexable | ffffffff |
| ukQTaqGkqTAI4PYamdFm | sss (Copy) | Excluded: test/duplicate | Empty |

All records are preserved. Prices, stock, status, book IDs, slugs, image URLs,
image IDs and assignments were not changed. `seoNoindex` defaults to false and
can be reversed in Books > Search (SEO). Its public effect requires deploying
this change; Google removal depends on recrawling.

Blank/placeholder descriptions and search summaries were replaced with truthful
catalog-level copy. Test listings explicitly describe their placeholder purpose.
Altrove copy uses only its saved paperback format/Photography category and the
observed restaurant-table photograph. A similarly named publication was found
online, but its author/story/edition could not be matched confidently to this
record, so none were copied. The owner can expand the description with verified
creator, subject and edition information in Books > Details.

Image labels now describe the observed red geometric artwork, two white
Lyricalmyrical logos, floral pattern, stack of art books and restaurant table.
Filename-only labels such as `dyptics2.bmp` and `IMG_2555.jpg` were removed.
Original labels: BETTER RED; Lyricalmyrical Secondary Logo with white font;
Lyricalmyrical Logo - white font - no background.png;
image-from-rawpixel-id-4180406-jpeg.jpg; IMG_2555.jpg; dyptics2.bmp.
Search summaries and titles were previously empty; the original Altrove listing
now has a custom search title. The prior noindex fields were absent.
