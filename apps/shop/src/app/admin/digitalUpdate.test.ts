// Digital D2b: the Tell buyers card's line for each state of the last send.
import { expect, test } from "vitest";
import { hasNewVersion, jobActive, jobLine, type DigitalUpdateJob } from "./digitalUpdate";

const job = (extra: Partial<DigitalUpdateJob>): DigitalUpdateJob => ({ id: "u", status: "sent", audience: 3, sent: 3, failed: 0, createdAt: "2026-11-17T12:00:00Z", finishedAt: "2026-11-17T12:10:00Z", lastError: "", ...extra });

test("each state reads in plain words", () => {
  expect(jobLine(null)).toBe("");
  expect(jobLine(job({ status: "queued", sent: 0 }))).toBe("Starting soon: 3 buyers will be told within 15 minutes.");
  expect(jobLine(job({ status: "sending", sent: 1 }))).toBe("Telling buyers: 1 of 3 so far.");
  expect(jobLine(job({ sent: 1, audience: 1 }))).toMatch(/^Last told 1 buyer on /);
  expect(jobLine(job({ failed: 2 }))).toContain("(2 addresses didn't work)");
  expect(jobLine(job({ status: "paused", lastError: "Sending stopped." }))).toBe("Sending stopped.");
  expect(jobLine(job({ status: "cancelled", sent: 2 }))).toMatch(/^Stopped on .* after 2 buyers\.$/);
  expect(jobActive(job({ status: "sending" }))).toBe(true);
  expect(jobActive(job({}))).toBe(false);
});

test("a new version is noticed on the product or any edition", () => {
  expect(hasNewVersion({ digitalFiles: [{ file: "a" }] })).toBe(false);
  expect(hasNewVersion({ digitalFiles: [{ file: "a", version: 2 }] })).toBe(true);
  expect(hasNewVersion({ variants: [{ digitalFiles: [{ file: "b", version: 3 }] }] })).toBe(true);
});
