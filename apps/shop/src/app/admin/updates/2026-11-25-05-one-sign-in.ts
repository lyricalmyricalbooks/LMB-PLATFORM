import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-sign-in",
  date: "2026-11-25",
  title: "Sign in with an emailed code, and go straight in from sign-up",
  summary: "The sign-in page has a second way in: Email me a sign-in code. You type the code Colophon emails you and you're in, no Google account needed. If you use an authenticator app, you'll still be asked for it. When your shop is ready after sign-up, Go to my store takes you inside already signed in, so you sign in once.",
  links: [{ label: "Home", tab: "overview" }],
} satisfies AppUpdate;
