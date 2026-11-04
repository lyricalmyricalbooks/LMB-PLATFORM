// A book's cover photo, kept in the stockroom (docs/combined-admin.md › H5). The Fair till for helpers shows it
// beside the book; a book on the website uses its website photo there instead (features/fair-helpers.js). The photo
// is made small on this device first (240 pixels wide, JPEG), then stored under covers/{bookId}/ (storage.rules: the
// publisher writes, anyone signed in to this stockroom may read), and the book keeps its address as `coverUrl`.
import { $, showToast } from '../main.js';

const WIDTH = 240;

/** Shrinks a picked image to a small JPEG. Resolves to a Blob, or null when the file isn't an image this browser reads. */
function shrinkImage(file, width = WIDTH) {
  return new Promise((resolve) => {
    if (!file || !/^image\//.test(file.type || '')) { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, width / (img.naturalWidth || width));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.naturalWidth || width) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || width) * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Shows a cover address in the book form (or none): the hidden field, the preview and the Remove button. */
function setBookCoverField(url = '') {
  const clean = /^https:\/\//.test(String(url || '')) ? String(url) : '';
  const field = $('nb-cover');
  if (field) field.value = clean;
  const preview = $('nb-cover-preview');
  if (preview) { preview.hidden = !clean; if (clean) preview.src = clean; else preview.removeAttribute('src'); }
  const remove = $('nb-cover-remove');
  if (remove) remove.hidden = !clean;
  const file = $('nb-cover-file');
  if (file) file.value = '';
}

/** The file picker in the book form: shrink, upload, show. */
async function pickBookCover(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const bookId = String($('nb-id')?.value || '').trim();
  if (!bookId) { showToast('Type the title first, then add the cover.', 'warn'); setBookCoverField($('nb-cover')?.value); return; }
  if (typeof window._fbUploadCover !== 'function') { showToast('Covers need the cloud connection. Try again once you are online.', 'warn'); return; }
  const blob = await shrinkImage(file);
  if (!blob) { showToast("That file isn't a picture this browser can read. Try a JPEG or PNG.", 'warn'); return; }
  try {
    const url = await window._fbUploadCover(blob, bookId);
    setBookCoverField(url);
    showToast('✓ Cover added. Save the book to keep it.', 'ok');
  } catch (e) {
    console.warn('Cover upload failed', e);
    showToast("The cover couldn't be uploaded. Check the signal and try again.", 'err');
  }
}

/** Remove: the book goes back to its colour (or its website photo) on the Fair till once saved. */
function removeBookCover() {
  setBookCoverField('');
}

export {
  pickBookCover,
  removeBookCover,
  setBookCoverField,
};
