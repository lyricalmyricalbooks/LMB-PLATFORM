// Copy to the clipboard and say so only once it actually worked (the browser can refuse).
import toast from "react-hot-toast";

export async function copyText(text: string, what = "Code"): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error(`Couldn't copy — select the ${what.toLowerCase()} and copy it by hand.`);
    return false;
  }
}
