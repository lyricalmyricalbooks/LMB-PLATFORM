// The square picture a social post can use (code plan 27.11): the chosen product photo, whole (never cropped), centred on
// a 1080 × 1080 JPEG whose border is the photo's own main colour. Square pictures show uncropped in every feed, and
// Instagram takes only JPEG, so a PNG or WebP cover posts fine this way. Made once per post, in the shop's own bucket
// (`social/<postId>.jpg`); a photo from anywhere else is left as it is.
const crypto = require("crypto");
const { storagePathOf, downloadUrl, IMMUTABLE } = require("./imageCopies");

const SIDE = 1080;
const QUALITY = 90;

/** The square copy's address, or null when the photo isn't in this shop's bucket or can't be read. */
async function squarePicture({ bucket, sharp, imageUrl, postId }) {
  const path = storagePathOf(imageUrl, bucket.name);
  if (!path || !/^[A-Za-z0-9_-]{1,64}$/.test(String(postId || ""))) return null;
  const [buffer] = await bucket.file(path).download();
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const { dominant } = await sharp(buffer, { failOn: "none" }).stats();
  const background = { r: dominant?.r ?? 255, g: dominant?.g ?? 255, b: dominant?.b ?? 255, alpha: 1 };
  const out = await image
    .resize(SIDE, SIDE, { fit: "contain", background, withoutEnlargement: false })
    .flatten({ background })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer();
  const target = `social/${postId}.jpg`;
  const token = crypto.randomUUID();
  await bucket.file(target).save(out, {
    resumable: false,
    contentType: "image/jpeg",
    metadata: { cacheControl: IMMUTABLE, metadata: { firebaseStorageDownloadTokens: token, madeFrom: path } },
  });
  return downloadUrl(bucket.name, target, token);
}

module.exports = { squarePicture, SIDE };
