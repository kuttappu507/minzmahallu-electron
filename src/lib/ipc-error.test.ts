import { describe, it, expect } from "vitest";
import { friendlySendError } from "./ipc-error";

const DICT: Record<string, string> = {
  wa_not_connected: "WA-NOT-CONNECTED-ML",
  wa_no_internet: "WA-NO-INTERNET-ML",
  wa_send_failed: "WA-SEND-FAILED-ML",
  ui_failed_save: "FAILED-SAVE",
};
const T = (key: string) => DICT[key] ?? key;

describe("friendlySendError", () => {
  it("maps the wrapped 'not connected' IPC rejection to localized guidance", () => {
    const raw =
      "Error invoking remote method 'whatsapp:sendDonationReceipt': Error: WhatsApp is not connected yet. Open the WhatsApp page, connect and scan the QR code, then try again.";
    expect(friendlySendError(new Error(raw), T)).toBe("WA-NOT-CONNECTED-ML");
  });

  it("maps the un-wrapped engine message too", () => {
    expect(friendlySendError(new Error("WhatsApp is not paired yet. Open the WhatsApp page and scan the QR code, then try again."), T)).toBe("WA-NOT-CONNECTED-ML");
  });

  it("maps 'no internet' to localized guidance", () => {
    expect(friendlySendError(new Error("No internet connection. Check your network and try again."), T)).toBe("WA-NO-INTERNET-ML");
  });

  it("falls back to the stripped raw message for unknown errors", () => {
    expect(friendlySendError(new Error("Error invoking remote method 'whatsapp:sendMessage': TypeError: boom happened"), T)).toBe("boom happened");
  });

  it("handles structured {error} and plain strings", () => {
    expect(friendlySendError({ error: "WhatsApp is not connected" }, T)).toBe("WA-NOT-CONNECTED-ML");
    expect(friendlySendError("No internet connection", T)).toBe("WA-NO-INTERNET-ML");
  });

  it("never returns an empty string", () => {
    expect(friendlySendError(new Error(""), T)).toBe("WA-SEND-FAILED-ML");
    expect(friendlySendError(undefined, T)).toBe("WA-SEND-FAILED-ML");
  });
});
