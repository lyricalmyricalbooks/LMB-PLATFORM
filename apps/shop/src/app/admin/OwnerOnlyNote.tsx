import { useEffect, useState } from "react";
import { adminApi } from "./api";

/**
 * On the owner's own Settings pages (Payments, Google, Apps, the web address), staff see one line saying they can look
 * but only an owner can change the connections. The server refuses them anyway (functions/index.js requireOwner).
 */
export function OwnerOnlyNote({ what }: { what: string }) {
  const [staff, setStaff] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve(adminApi.myRole?.()).then(r => { if (live) setStaff(r === "staff"); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!staff) return null;
  return (
    <p className="rp-alert" data-tone="info" role="note" data-owner-only>
      You can look here, but only an owner can change {what}.
    </p>
  );
}
