// The team roles, in words. Shared by the server (accounts.js) and the page (app.js), so it uses nothing from Node.
// The roles themselves are the shop's own (apps/shop/functions/roles.js).

export const ROLES = Object.freeze(["owner", "staff", "author", "bookkeeper"]);

export const ROLE_NAMES = Object.freeze({ owner: "Owner", staff: "Staff", author: "Author", bookkeeper: "Bookkeeper" });

/** What each role can do, for the page. */
export const ROLE_HINTS = Object.freeze({
  owner: "Everything, including billing and the team.",
  staff: "The shop's admin, but not billing, payment and email connections, or the team.",
  author: "Only their own books, in the stockroom.",
  bookkeeper: "Reads orders, sales, tax, payouts and the stockroom's tax centre. Can't change anything.",
});

/** The same, as the invite email puts it: "… invited you to join the team for <press>, as <words>." */
export const ROLE_WORDS = Object.freeze({
  owner: "an owner, with everything including billing and the team",
  staff: "staff, with the shop's admin but not billing, payment and email connections, or the team",
  author: "an author, with your own books in the stockroom",
  bookkeeper: "the bookkeeper, reading the shop's orders, sales, tax and payouts without changing anything",
});
