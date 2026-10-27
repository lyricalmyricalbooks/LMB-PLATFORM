// Book videos (Books › edit › Images › Add video). A video sits in the book's `photos` list like any
// photo, so it is ordered with the photos and needs no new field anywhere else: its `url` is a still
// frame (the poster, a normal photo with `srcset`), so shop cards, search results, emails and search
// engines that only know photos keep showing a picture. `videoUrl` is the playable file in Storage.
// Only the product page and its enlarged viewer play it (Studio › Style › Product page › Show book videos).

export type BookVideoFields = { videoUrl?: string; videoType?: string; videoBytes?: number; videoDuration?: number };

/** A photo entry that carries a playable video (https only, so a pasted script URL never plays). */
export function isVideoItem(photo: unknown): photo is { url: string } & BookVideoFields {
  const v = (photo as any)?.videoUrl;
  return typeof v === "string" && /^https:\/\//i.test(v.trim());
}

/** The product page gallery: every photo, with videos left out when Studio switches them off. */
export function galleryPhotos<T>(photos: T[], showVideos: boolean): T[] {
  return showVideos ? photos : photos.filter((p) => !isVideoItem(p));
}

/** Plain photos only (edition photo pickers and the like, where a video's still frame would confuse). */
export function stillPhotos<T>(photos: T[]): T[] {
  return photos.filter((p) => !isVideoItem(p));
}

/** Book videos always start without sound (the shopper can unmute with the player's own control).
 *  React doesn't reliably reflect the `muted` prop onto the element, so set it directly as well. */
export function muteVideo(el: HTMLVideoElement | null): void {
  if (!el) return;
  el.defaultMuted = true;
  el.muted = true;
}
