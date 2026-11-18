// Visibility › "Needs a check before it goes on sale" (product types plan, round 2). A product of a type that needs a
// check (alcohol, supplements, CBD) stays a draft until Colophon has said yes for that type; the owner asks here with a
// short note, sees the answer, and reads the reason when it is no. The rules and the server hold the line too.
import { useState } from "react";
import { PrimaryButton, StatusBadge, TextArea } from "./riso/components";
import { approvalWhy, APPROVAL_NOTE_MAX } from "../../shared/typeApproval";
import { typeApprovalData } from "./typeApprovalApi";

type Status = { typeId: string; state: "approved" | "declined" | "waiting" | "ask"; reason: string; askedAt: string };

const asked = (iso: string) => {
  const day = iso ? new Date(iso) : null;
  return day && !Number.isNaN(day.getTime()) ? day.toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "";
};

export function TypeApprovalCard({ status, typeName }: { status: Status; typeName: string }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const send = async () => {
    setSending(true); setFailed(false);
    try { await typeApprovalData.ask(status.typeId, typeName, note); setNote(""); }
    catch { setFailed(true); }
    finally { setSending(false); }
  };
  if (status.state === "approved") {
    return <div className="be-approval" data-state="approved"><StatusBadge tone="success">Checked</StatusBadge><p>You can sell {typeName.toLowerCase()} in your shop.</p></div>;
  }
  return (
    <div className="be-approval" data-state={status.state} role="group" aria-label="Needs a check before it goes on sale">
      <div className="be-approval-head">
        <StatusBadge tone={status.state === "declined" ? "danger" : status.state === "waiting" ? "info" : "warning"}>
          {status.state === "declined" ? "Not approved" : status.state === "waiting" ? "Being checked" : "Needs a check"}
        </StatusBadge>
        <strong>{typeName} stays a draft until we've checked it</strong>
      </div>
      <p>{approvalWhy(status.typeId)}</p>
      {status.state === "waiting" && <p>You asked{asked(status.askedAt) ? ` on ${asked(status.askedAt)}` : ""}. We usually answer within two working days, and you can keep editing meanwhile.</p>}
      {status.state === "declined" && status.reason && <p className="be-approval-reason"><span>Our answer:</span> {status.reason}</p>}
      {status.state !== "waiting" && (
        <>
          <TextArea label={status.state === "declined" ? "Tell us what changed" : "Anything we should know (optional)"} rows={2} maxLength={APPROVAL_NOTE_MAX}
            value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. your licence number and where you sell" />
          <div className="be-approval-actions">
            <PrimaryButton size="sm" busy={sending} onClick={send}>{status.state === "declined" ? "Ask again" : "Ask for a check"}</PrimaryButton>
            {failed && <span role="alert" className="be-warn">That didn't send. Check your connection and try again.</span>}
          </div>
        </>
      )}
    </div>
  );
}
