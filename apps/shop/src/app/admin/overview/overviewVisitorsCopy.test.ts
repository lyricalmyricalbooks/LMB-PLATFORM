import { describe, expect, it } from "vitest";
import { actionsHeadline, clock, dayName, hourName, liveHeadline, mixHeadline, outboundHeadline, shortPageTitle, pageTimeHeadline, visitHoursHeadline } from "./overviewVisitorsCopy";

describe("visitor widget words", () => {
  it("writes time as m:ss", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65)).toBe("1:05");
    expect(clock(59.6)).toBe("1:00");
    expect(clock(3725)).toBe("1:02:05");
    expect(clock(NaN)).toBe("0:00");
  });
  it("names hours and days", () => {
    expect(hourName(0)).toBe("12am");
    expect(hourName(11)).toBe("11am");
    expect(hourName(12)).toBe("12pm");
    expect(hourName(23)).toBe("11pm");
    expect(dayName("Sat")).toBe("Saturday");
    expect(dayName(0)).toBe("Monday");
    expect(dayName(6)).toBe("Sunday");
  });
  it("answers each widget's question", () => {
    expect(visitHoursHeadline({ day: "Sat", hour: 11, value: 9 })).toBe("Most visitors come on Saturday around 11am.");
    expect(visitHoursHeadline({ day: "Sat", hour: 11, value: 0 })).toBe("No visits recorded by hour yet.");
    expect(liveHeadline(3, { label: "Salt Hymns", people: 2 })).toBe("3 people on the site right now — most on Salt Hymns.");
    expect(liveHeadline(0, null)).toBe("Nobody is on the site this minute.");
    expect(liveHeadline(1, null)).toBe("1 person on the site right now.");
    expect(pageTimeHeadline({ label: "Home", seconds: 161, views: 40 })).toBe("Home holds readers longest — 2:41 a view.");
    expect(pageTimeHeadline({ label: "Home", seconds: 161, views: 1200 }, "views")).toBe("Home is read most — 1,200 views, 2:41 each.");
    expect(actionsHeadline({ label: "Opened a book page", people: 40 }, 80)).toBe("The most common thing visitors do: opened a book page (40 people — 50% of visitors).");
    expect(outboundHeadline({ label: "instagram.com", clicks: 30 }, 60)).toBe("When visitors leave through a link, it is most often to instagram.com — 50% of links followed.");
    expect(outboundHeadline(null, 0)).toBe("Nobody followed a link away from the shop.");
  });
  it("compares returning visitors with the period before only when it was recorded", () => {
    expect(mixHeadline(60, 40, 70, 30)).toBe("40% of visitors are coming back, up from 30% before.");
    expect(mixHeadline(30, 70, null, null)).toBe("Most visitors are coming back: 70% are returning.");
    expect(mixHeadline(0, 0, 1, 1)).toBe("No visitors recorded yet.");
  });
  it("drops the shop name from live page titles", () => {
    expect(shortPageTitle("Salt Hymns — Lyricalmyrical Books")).toBe("Salt Hymns");
    expect(shortPageTitle("Checkout | Lyricalmyrical")).toBe("Checkout");
    expect(shortPageTitle("Lyricalmyrical Books")).toBe("Lyricalmyrical Books");
  });
});
