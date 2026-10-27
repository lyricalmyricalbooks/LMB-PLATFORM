// Checks a shop profile against shop-profile.schema.json and writes the file Hosting serves as /shop-profile.js.
// No dependencies: the checks below follow the schema by hand, and profile.test.js keeps the two in step.
import { readFileSync } from "node:fs";

export const schema = JSON.parse(readFileSync(new URL("./shop-profile.schema.json", import.meta.url), "utf8"));

/** Returns a list of problems in plain words; an empty list means the profile is good. */
export function profileProblems(profile) {
  const problems = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return ["the profile is not an object"];
  checkObject(schema, profile, "profile", problems);
  return problems;
}

function checkObject(rule, value, where, problems) {
  for (const key of rule.required ?? []) {
    if (!(key in value)) problems.push(`${where}.${key} is missing`);
  }
  for (const [key, item] of Object.entries(value)) {
    const itemRule = rule.properties?.[key];
    if (!itemRule) {
      if (rule.additionalProperties === false) problems.push(`${where}.${key} is not part of the profile`);
      continue;
    }
    checkValue(itemRule, item, `${where}.${key}`, problems);
  }
}

function checkValue(rule, value, where, problems) {
  if ("const" in rule) {
    if (value !== rule.const) problems.push(`${where} must be ${JSON.stringify(rule.const)}`);
    return;
  }
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) problems.push(`${where} must be an object`);
    else checkObject(rule, value, where, problems);
  } else if (rule.type === "boolean") {
    if (typeof value !== "boolean") problems.push(`${where} must be true or false`);
  } else if (rule.type === "string") {
    if (typeof value !== "string") problems.push(`${where} must be text`);
    else if (rule.minLength && value.length < rule.minLength) problems.push(`${where} is empty`);
    else if (rule.pattern && !new RegExp(rule.pattern).test(value)) problems.push(`${where} has the wrong shape`);
  }
}

/** The text of /shop-profile.js. Throws when the profile has problems, so a bad file never reaches a shop. */
export function profileScript(profile) {
  const problems = profileProblems(profile);
  if (problems.length) throw new Error(`Shop profile has problems: ${problems.join("; ")}`);
  // JSON is valid JavaScript; escaping "<" keeps the text safe if a page ever inlines it.
  const json = JSON.stringify(profile, null, 2).replace(/</g, "\\u003c");
  return `// Written by the platform. Do not edit by hand.\nwindow.__SHOP_PROFILE__ = ${json};\n`;
}
