// 14.4: every error a press can see says what to do next and points to the exact help answer.
// The web door adds this to each failed answer; the pages show it under the message.

/** Each rule: a plain fix line and the id of a help answer (help/articles.js). The first rule that matches wins. */
const RULES = [
  { when: (s) => s === 401, fix: "Sign in again, then try once more.", help: "what-help" },
  { when: (s, p) => s === 402 || /\/billing/.test(p), fix: "Check your plan and payment details on the Plan and billing page, then try again.", help: "trial-ends" },
  { when: (s) => s === 403, fix: "Ask the owner of the shop to make this change, or to give you a role that can.", help: "team" },
  { when: (s) => s === 404, fix: "Go back to your list of shops and open it again from there.", help: "what-help" },
  { when: (s) => s === 409, fix: "Someone else changed this a moment ago. Refresh the page and try again.", help: "what-help" },
  { when: (s) => s === 429, fix: "You've tried a few times in a row. Wait a minute, then try again.", help: "what-help" },
  { when: (s) => s >= 500, fix: "This one is on our side. Wait a minute and try again, then write to us from Help with the code shown.", help: "what-help" },
  { when: (s) => s >= 400, fix: "Check what you typed, fix anything marked, and try again.", help: "what-help" },
];

/** The fix line and help link for an error answer. `path` is the page's route, `status` its HTTP code. */
export function errorHelp(status, path = "") {
  const rule = RULES.find((r) => r.when(Number(status) || 500, String(path)));
  return { fix: rule.fix, helpLink: `/help/#${rule.help}` };
}

export const ERROR_HELP_RULES = RULES.map((r) => ({ fix: r.fix, help: r.help }));
