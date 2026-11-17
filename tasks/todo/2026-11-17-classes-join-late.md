# Classes: join a course late (four ways plan, Classes leftovers)

- [x] `lateJoin` on a course service (cleanService keeps it only for courses)
- [x] Shared `joinableCourse`: the dates left at their share of the price while 2+ are left; null when closed
- [x] Server: public actions read the course as joined now (`publicService`), Timetable lists late-joinable courses,
      the owner's create can add a late joiner, the booking keeps `course.joined`
- [x] Website: "Under way · join for the last N of M dates" on Book a time and the Timetable
- [x] Admin: course toggle "Let people join after it starts, paying for the dates left"
- [x] Tests: shared rule, late sign-up price and ledger, closing with one date left, off by default

## Review
Late joiners take the same ledger items as everyone at each remaining start, so places stay shared; nothing else in the
booking path changed, because the joined-now service is just a shorter course with a lower price.
