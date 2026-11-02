// Feature rollout (plan 14.6): a new feature ships OFF, then turns on for the test shop, then for presses who chose to
// try new things, then for everyone. One platform setting moves it along; one press can be switched off by hand at any
// time without a release. This answers one question, "is this feature on for this shop?", so the shop's pages and the
// platform's services all ask it the same way.
//
//   stages (in order): "off" -> "test" (test shop only) -> "early" (test shop + presses who opted in) -> "everyone"
//
// `stages` is the platform's saved map { feature: stage }, `shop` is the shop's registry row. A feature nobody has
// listed is off. `shop.featuresOff` (a list) switches single features off for that one press, and wins over any stage.
export const STAGES = Object.freeze(["off", "test", "early", "everyone"]);

const STAGE_WORDS = Object.freeze({
  off: "off for every press",
  test: "on for the test shop only",
  early: "on for the test shop and presses who chose to try new things first",
  everyone: "on for every press",
});

/** The stage a feature is at: a listed stage, or "off" for anything unlisted or misspelled. */
export function stageOf(stages, feature) {
  const stage = stages?.[feature];
  return STAGES.includes(stage) ? stage : "off";
}

/** Whether `feature` is on for this shop. */
export function featureOn(stages, feature, shop = {}) {
  if (Array.isArray(shop.featuresOff) && shop.featuresOff.includes(feature)) return false;
  const stage = stageOf(stages, feature);
  if (stage === "everyone") return true;
  if (stage === "off") return false;
  if (shop.testShop === true) return true;
  return stage === "early" && shop.earlyAccess === true;
}

/** Every feature in `stages` as { feature: true|false } for this shop (what the shop's profile carries). */
export function featuresFor(stages, shop = {}) {
  return Object.fromEntries(Object.keys(stages ?? {}).sort().map((feature) => [feature, featureOn(stages, feature, shop)]));
}

/**
 * Moves a feature to a stage and returns the new map. Only one step forward at a time, or straight back to "off": a
 * feature never jumps from off to everyone, so the test shop always sees it first. Refuses an unknown stage in words.
 */
export function moveFeature(stages, feature, to) {
  if (!/^[a-zA-Z][a-zA-Z0-9]{2,40}$/.test(String(feature))) throw new Error("A feature's name is letters and numbers only.");
  if (!STAGES.includes(to)) throw new Error(`There's no stage called ${to}. The stages are: ${STAGES.join(", ")}.`);
  const from = stageOf(stages, feature);
  if (to !== "off" && STAGES.indexOf(to) > STAGES.indexOf(from) + 1) {
    throw new Error(`${feature} is ${STAGE_WORDS[from]}. Move it one step at a time, so the test shop sees it first.`);
  }
  return { ...stages, [feature]: to };
}

/** One plain sentence for the control room. */
export function describeStage(stages, feature) {
  return `${feature} is ${STAGE_WORDS[stageOf(stages, feature)]}.`;
}
