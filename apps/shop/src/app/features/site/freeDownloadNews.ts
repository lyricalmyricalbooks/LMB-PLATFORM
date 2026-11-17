// Digital D2c (Beta): a free download's checkout offers a newsletter tick box, so a giveaway can grow the shop's list.
// Shown only when nothing is paid and the bag holds only downloads; never ticked for the buyer. A ticked box asks for
// the usual double opt-in (functions/newsletter.js), so the buyer still confirms by email.

/** True when checkout should show the newsletter tick: a free order of downloads only. */
export function freeDownloadNewsShown(totalBeforeGiftCards: number, hasDownload: boolean, items: { physical?: boolean }[] | null | undefined): boolean {
  return totalBeforeGiftCards === 0 && hasDownload && !(items || []).some((item) => item?.physical);
}
