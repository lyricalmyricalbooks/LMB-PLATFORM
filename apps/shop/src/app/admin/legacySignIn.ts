// One press kept its stockroom in a separate Firebase project, and its admin sign-in also signed into that project
// with the same Google credential (src/lib/legacyFirebase.ts). New shops keep the stockroom in their own project, so
// this only happens when the shop profile turns the `legacyStockroomSignIn` switch on (plan 1.17); otherwise the
// legacy project's code is never even downloaded.
import { signInWithCredential, type AuthCredential } from "firebase/auth";
import { switchOn } from "../../lib/shopProfile";

type LegacyModule = { legacyAuth: Parameters<typeof signInWithCredential>[0] };

/** Signs into the separate stockroom project when the switch is on. True when it tried. Never throws. */
export async function signIntoLegacyStockroom(
  credential: AuthCredential | null,
  on: boolean = switchOn("legacyStockroomSignIn"),
  load: () => Promise<LegacyModule> = () => import("../../lib/legacyFirebase"),
  signIn: typeof signInWithCredential = signInWithCredential,
): Promise<boolean> {
  if (!on || !credential) return false;
  try {
    const { legacyAuth } = await load();
    await signIn(legacyAuth, credential);
  } catch (err) {
    console.warn("Could not auto-sign into legacy project:", err);
  }
  return true;
}
