import { describe, expect, it } from "vitest";
import { readSenderStatus } from "./senderStatus";

describe("readSenderStatus", () => {
  it("reads the Gmail address and the backup", () => {
    expect(readSenderStatus({ ok: true, gmailAddress: "owner@example.com", gmailSaved: false, backup: "platform" })).toEqual({ gmailAddress: "owner@example.com", backup: "platform" });
    expect(readSenderStatus({ gmailAddress: "owner@example.com", backup: "resend" }).backup).toBe("resend");
  });

  it("treats an old server or an odd answer as unknown, never as a wrong promise", () => {
    expect(readSenderStatus({ entries: [] })).toEqual({ gmailAddress: "", backup: null });
    expect(readSenderStatus(null)).toEqual({ gmailAddress: "", backup: null });
    expect(readSenderStatus({ gmailAddress: "<script>", backup: "elsewhere" })).toEqual({ gmailAddress: "", backup: null });
  });
});
