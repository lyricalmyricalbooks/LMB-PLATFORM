# Classes, step C1b: the Timetable page on the shop's website (Beta)

Approved plan: Ways to sell › Classes & workshops (C1 Timetable). C1a put the admin page on the Bookings engine; this
step gives customers the week's classes on the shop's own site and lets shops switch Classes on.

## What this step does
- [x] Server (`functions/bookings.js`): public action `classTimetable` (a week of dated classes with places left, only
      while Classes is on and the shop takes bookings); `settings/website.classesLive` kept in step (a class is saved or
      deleted, the on/off switch, the owner's Ways to sell switch through admin op `hint`).
- [x] Website `/classes` (`ClassesPage.tsx`): the week day by day, each class with its time, length, price and places
      left; Sign up (or Join the waiting list when full) hands over to Book a time with the class and day chosen, so the
      sign-up, payment, packs and waiting list stay one path. Week arrows, loading, error and nothing-on messages.
- [x] Links: header icon, phone menu and footer while `classesLive`; Studio toggle to hide the icon.
- [x] Studio: page template `classesPage`, regions, words (Text & labels › Classes page, English and French), sample
      classes in the preview, browser check.
- [x] `built: true` for Classes (control room can turn it on per shop; still Beta, off by default).
- [x] Release note, guides.

## Not in this step
An "until" date for a repeating class, courses (C2), passes and intro offers (C3), minimum numbers and agreement (C4).

## Checks
- [x] Server tests: timetable answers (places left, full, off without either switch, not live), `classesLive` hint.
- [x] Page rules tests; designer coverage tests; Studio browser check for the new page.
- [x] Full shop tests, typecheck, lint, build; root tests.
- [x] Screenshots on desktop and phone.

## Review
One read-only server action and one page that hands over to Book a time: no second sign-up, payment or places path.
The links follow one server-kept hint (`classesLive`), like Bookings and Events. No rules, indexes or scheduled jobs
changed. Classes is now `built`, still Beta and off per shop until the control room and the owner switch it on.
Checked with sample data in Studio's preview (desktop and phone) and the new Studio browser check; not tried on a real
account. Left for later: Sign up preselecting the exact time on Book a time, an "until" date, courses, passes.
