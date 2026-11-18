# Bookings plan 4, 2.6: Book button for any website

- [x] `public/book-button.js`: a marked link opens /book?embed=1 in a frame over the other site; phones and no script keep the link
- [x] Hosting: only /book may be framed by another site (`frame-ancestors *`), tested
- [x] Booking page framed: no shop header/footer, Close in place of the back link (English and French), Escape closes, card pages open in the whole window
- [x] Share dialog: On top of your page / In a new tab, code with the script
- [x] Tests: button code, embed rules, hosting header
- [x] Help line, release note, area guide
- [x] Screenshots at 1440 and 390 on a stand-in "other website"

## Review
The frame is only a window onto the same booking page; every price and time is still the server's. Card pages never
open inside the frame: the click that pays lets the frame move the whole window, and a new tab is the fallback.
