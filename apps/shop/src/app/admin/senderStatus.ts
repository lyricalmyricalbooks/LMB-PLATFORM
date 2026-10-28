import { useEffect, useState } from "react";
import { emailFunction } from "./notificationApi";

// What Settings › Email sender needs to explain sending (plan 2.3b): the Gmail address the shop sends from once Gmail
// is connected, and what happens until then. "platform": the platform's shared sender, with the shop's name and
// replies to the shop. "resend": the shop's own Resend key (shops not on the platform). null: not known yet.
export type SenderStatus = { gmailAddress: string; backup: "platform" | "resend" | null };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads the server's answer; anything unexpected becomes "unknown" rather than a wrong promise to the owner. */
export function readSenderStatus(answer: unknown): SenderStatus {
  const a = (answer && typeof answer === "object" ? answer : {}) as Record<string, unknown>;
  return {
    gmailAddress: typeof a.gmailAddress === "string" && EMAIL.test(a.gmailAddress) ? a.gmailAddress : "",
    backup: a.backup === "platform" || a.backup === "resend" ? a.backup : null,
  };
}

export function useSenderStatus(): SenderStatus {
  const [status, setStatus] = useState<SenderStatus>({ gmailAddress: "", backup: null });
  useEffect(() => {
    let live = true;
    emailFunction({ action: "senderStatus" })
      .then((answer) => { if (live) setStatus(readSenderStatus(answer)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return status;
}
