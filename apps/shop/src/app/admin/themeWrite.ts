/**
 * Replace design maps atomically, preserving unrelated website settings. The public
 * settings/website document only ever receives the published design: Studio's draft and
 * My themes live in admin-only documents (admin/themeStore.ts), so a draft-only write
 * carries no design at all and stray draft fields are never written back.
 */
export function themeWrite(settings: Record<string, any>, publish = false, now = new Date()) {
  const payload = JSON.parse(JSON.stringify(settings));
  delete payload.draftDesign;
  delete payload.savedThemes;
  if (payload.design) {
    if (!publish) delete payload.design;
    // A campaign ending later keeps this newer Publish instead of switching back (functions/themeSchedule.js).
    else payload.designPublishedAt = now.toISOString();
  }
  return { payload, options: { mergeFields: Object.keys(payload) } };
}
