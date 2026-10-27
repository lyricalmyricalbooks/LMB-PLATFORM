// Finishing an email-link sign-in. When it fails (a stale saved address, a mistyped one) the
// saved address is forgotten and the card keeps asking for the email, so the shopper can retype
// it against the same one-time link instead of being thrown back to the plain login form.
export interface EmailLinkDeps {
  signIn: (email: string) => Promise<unknown>;
  forgetSavedEmail: () => void;
}

export async function finishEmailLinkSignIn(email: string, deps: EmailLinkDeps): Promise<{ ok: boolean; error?: unknown; keepAsking?: boolean }> {
  try {
    await deps.signIn(email.trim());
    deps.forgetSavedEmail();
    return { ok: true };
  } catch (error) {
    deps.forgetSavedEmail();
    return { ok: false, error, keepAsking: true };
  }
}
