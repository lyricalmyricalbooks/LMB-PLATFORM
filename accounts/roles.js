// The team roles, in words. Shared by the server (accounts.js) and the page (app.js), so it uses nothing from Node.
// The roles themselves are the shop's own (apps/shop/functions/roles.js).

export const ROLES = Object.freeze(["owner", "staff", "author"]);

export const ROLE_NAMES = Object.freeze({ owner: "Owner", staff: "Staff", author: "Author" });

/** What each role can do, for the page. */
export const ROLE_HINTS = Object.freeze({
  owner: "Everything, including billing and the team.",
  staff: "The shop's admin, but not billing, secret keys or the team.",
  author: "Only their own books, in the stockroom.",
});

/** The same, as the invite email puts it: "… invited you to join the team for <press>, as <words>." */
export const ROLE_WORDS = Object.freeze({
  owner: "an owner, with everything including billing and the team",
  staff: "staff, with the shop's admin but not billing, secret keys or the team",
  author: "an author, with your own books in the stockroom",
});
