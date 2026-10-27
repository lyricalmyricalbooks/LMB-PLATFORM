/** Machine-readable failure; shopper wording is resolved through Studio copy. */
export class AppVerificationError extends Error {
  constructor() {
    super("app-check/verification-failed");
    this.name = "AppVerificationError";
  }
}
