import { useEffect, useState } from "react";

/** The admin's phone layout (Pocket Pressroom) starts below 768px, the storefront's phone breakpoint. */
export const PHONE_MQ = "(max-width: 767px)";

/** True while the window is phone-sized; follows rotation and resizing. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(PHONE_MQ).matches);
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.(PHONE_MQ) : undefined;
    if (!mq) return;
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return phone;
}
