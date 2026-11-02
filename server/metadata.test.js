import { test } from "node:test";
import assert from "node:assert/strict";
import { scriptedFetch } from "../clients/fake-fetch.js";
import { METADATA_TOKEN, metadataToken } from "./metadata.js";

const tokenAnswer = (access_token, expires_in = 3599) => ({ method: "GET", url: METADATA_TOKEN, auth: false, json: { access_token, expires_in, token_type: "Bearer" } });

test("the token comes from the metadata server, asked the way Google asks, and is kept until a minute before it runs out", async () => {
  let ms = 0;
  const fetch = scriptedFetch([tokenAnswer("ya29.first", 600), tokenAnswer("ya29.second", 600)]);
  const token = metadataToken({ fetch, now: () => ms });
  assert.deepEqual(await Promise.all([token(), token(), token()]), ["ya29.first", "ya29.first", "ya29.first"]);
  assert.equal(fetch.seen.length, 1, "three callers at once share one fetch");
  assert.equal(fetch.seen[0].headers["Metadata-Flavor"], "Google");
  ms = 539_000;
  assert.equal(await token(), "ya29.first");
  ms = 540_000;
  assert.equal(await token(), "ya29.second");
  fetch.done();
});

test("off Google Cloud the token says so, and the next call tries again", async () => {
  const fetch = scriptedFetch([{ method: "GET", url: METADATA_TOKEN, auth: false, status: 404, json: {} }, tokenAnswer("ya29.ok")]);
  const token = metadataToken({ fetch });
  await assert.rejects(token(), /only works on Google Cloud/);
  assert.equal(await token(), "ya29.ok");
  const empty = metadataToken({ fetch: scriptedFetch([{ method: "GET", url: METADATA_TOKEN, auth: false, json: {} }]) });
  await assert.rejects(empty(), /no token/);
  assert.throws(() => metadataToken({}), /fetch/);
});
