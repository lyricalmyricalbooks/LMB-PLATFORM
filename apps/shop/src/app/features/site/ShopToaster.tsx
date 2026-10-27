import { Toaster } from "react-hot-toast";
import { useLocation } from "react-router";
import { useLiveDesign } from "./useSiteData";
import { toastPosition, toastStyle } from "./toastStyle";

/**
 * The one place pop-up messages are drawn. Shop pages follow Studio's Short notice messages controls (the
 * unsaved design while previewing); the admin keeps the plain built-in look.
 */
export function ShopToaster() {
  const design = useLiveDesign();
  const { pathname } = useLocation();
  const shop = pathname === "/admin" || pathname.startsWith("/admin/") ? {} : design;
  return <Toaster position={toastPosition(shop)} toastOptions={{ style: toastStyle(shop) }} />;
}
