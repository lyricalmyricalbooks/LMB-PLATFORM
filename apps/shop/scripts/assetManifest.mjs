// Pure helpers for carry-previous-assets.mjs (tested in assetManifest.test.ts).
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

/** A plain file name inside dist/assets — never a path, never `..`. */
export const safeAssetName = name => typeof name === 'string' && SAFE_NAME.test(name) && !name.includes('..');

/** This build's asset file names, sorted, unsafe names dropped. */
export const assetNames = names => [...new Set(names.filter(safeAssetName))].sort();

/** Reads a published asset-manifest.txt; anything that is not a safe file name is ignored. */
export const parseAssetManifest = text => assetNames(String(text ?? '').split(/\r?\n/).map(line => line.trim()));

/** The published-content marker is a SHA-256 hex digest; anything else (an HTML error page) means "unknown". */
export const isFingerprint = text => /^[a-f0-9]{64}$/.test(String(text ?? '').trim());

/** A host answering a missing file with an HTML page (a catch-all rewrite, a 404 page) is not that file. */
export const isHtmlResponse = contentType => /^\s*text\/html\b/i.test(String(contentType ?? ''));
