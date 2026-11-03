// Two-step sign-in for the shop admin (code plan 22.6): a code from an authenticator app after Google. The shop's own
// Firebase project allows it (setup step 19, setup/twoStep.js in the platform). Anyone on the team may turn it on for
// themselves under Settings › Security; on a paid plan the platform asks the owner for it before changes to the plan,
// cards and billing details (accounts/twoStep.js), so the owner finishes those here instead of on the account page.
//
// The Firebase calls are passed in (`TwoStepAuth`), so the words and the steps are tested without Firebase
// (adminTwoStep.test.ts); `firebaseTwoStep` is the real set.
import {
  getMultiFactorResolver, GoogleAuthProvider, multiFactor, TotpMultiFactorGenerator,
  type Auth, type AuthCredential, type MultiFactorError, type MultiFactorResolver, type TotpSecret, type User, type UserCredential,
} from "firebase/auth";

/** Firebase's id for an authenticator-app second step (TotpMultiFactorGenerator.FACTOR_ID), read on load by nothing else. */
const TOTP = "totp";

/** The Firebase calls two-step sign-in needs. */
export type TwoStepAuth = {
  resolverOf(error: MultiFactorError): MultiFactorResolver;
  googleCredentialOf(error: MultiFactorError): AuthCredential | null;
  signInWithCode(resolver: MultiFactorResolver, hintUid: string, code: string): Promise<UserCredential>;
  newSecret(user: User): Promise<TotpSecret>;
  enroll(user: User, secret: TotpSecret, code: string): Promise<void>;
  unenroll(user: User, factorUid: string): Promise<void>;
  factors(user: User): Array<{ uid: string; factorId: string; displayName?: string | null; enrollmentTime: string }>;
};

export function firebaseTwoStep(auth: Auth): TwoStepAuth {
  return {
    resolverOf: (error) => getMultiFactorResolver(auth, error),
    googleCredentialOf: (error) => GoogleAuthProvider.credentialFromError(error as any),
    signInWithCode: (resolver, hintUid, code) => resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hintUid, code)),
    newSecret: async (user) => TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession()),
    enroll: (user, secret, code) => multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), "Authenticator app"),
    unenroll: (user, factorUid) => multiFactor(user).unenroll(factorUid),
    factors: (user) => multiFactor(user).enrolledFactors,
  };
}

/** Google said yes and a code is still needed: what the code step finishes with. */
export class TwoStepNeeded extends Error {
  readonly resolver: MultiFactorResolver;
  readonly hintUid: string;
  /** The Google sign-in itself, for the shops that also sign in to an older stockroom (legacySignIn.ts). */
  readonly googleCredential: AuthCredential | null;
  constructor(resolver: MultiFactorResolver, hintUid: string, googleCredential: AuthCredential | null) {
    super("Type the code from your authenticator app.");
    this.name = "TwoStepNeeded";
    this.resolver = resolver;
    this.hintUid = hintUid;
    this.googleCredential = googleCredential;
  }
}

/** A sign-in error that asks for the second step, as a TwoStepNeeded; anything else is null. */
export function twoStepNeeded(two: TwoStepAuth, error: unknown): TwoStepNeeded | null {
  if ((error as { code?: string } | null)?.code !== "auth/multi-factor-auth-required") return null;
  const resolver = two.resolverOf(error as MultiFactorError);
  const hint = resolver.hints.find((h) => h.factorId === TOTP);
  if (!hint) return null;
  return new TwoStepNeeded(resolver, hint.uid, two.googleCredentialOf(error as MultiFactorError));
}

/** The six digits, whatever the person typed around them ("123 456", "123-456"). */
export const cleanCode = (text: string) => String(text).replace(/\D/g, "").slice(0, 8);
export const codeLooksRight = (text: string) => cleanCode(text).length === 6;

/** Finishes a sign-in with the code from the app. */
export function finishTwoStep(two: TwoStepAuth, pending: TwoStepNeeded, code: string): Promise<UserCredential> {
  return two.signInWithCode(pending.resolver, pending.hintUid, cleanCode(code));
}

/** The authenticator apps this person has set up (usually one). */
export function appsSetUp(two: TwoStepAuth, user: User) {
  return two.factors(user).filter((f) => f.factorId === TOTP);
}

/** What the setup screen shows: the key to type into the app, and the `otpauth://` link its picture holds. */
export async function startSetup(two: TwoStepAuth, user: User, shopName: string): Promise<{ secret: TotpSecret; key: string; link: string }> {
  const secret = await two.newSecret(user);
  return { secret, key: secret.secretKey.replace(/(.{4})/g, "$1 ").trim(), link: secret.generateQrCodeUrl(user.email ?? "", shopName || "Shop admin") };
}

export function finishSetup(two: TwoStepAuth, user: User, secret: TotpSecret, code: string): Promise<void> {
  return two.enroll(user, secret, cleanCode(code));
}

export const WRONG_CODE = "That code didn't work. Codes change every 30 seconds: type the one on screen now.";

/** Plain words for anything two-step sign-in can answer. */
export function twoStepWords(error: unknown): string {
  const code = String((error as { code?: string } | null)?.code ?? "");
  if (code === "auth/invalid-verification-code" || code === "auth/missing-code") return WRONG_CODE;
  if (code === "auth/requires-recent-login") return "For your safety, sign out and sign in again, then set this up straight away.";
  if (code === "auth/operation-not-allowed" || code === "auth/admin-restricted-operation" || code === "auth/unsupported-first-factor") {
    return "Authenticator codes aren't switched on for this shop yet. We switch them on for every shop; try again tomorrow, or ask for help.";
  }
  if (code === "auth/totp-challenge-timeout" || code === "auth/missing-multi-factor-session" || code === "auth/invalid-multi-factor-session" || code === "auth/code-expired") {
    return "That took too long. Start again and type the newest code.";
  }
  if (code === "auth/too-many-requests") return "Too many tries in a row. Wait a minute, then try again.";
  if (code === "auth/network-request-failed") return "Couldn't reach Google. Check your internet connection, then try again.";
  return "Something went wrong. Try again in a moment.";
}
