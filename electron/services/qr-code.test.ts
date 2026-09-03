import { describe, it, expect } from "vitest";
import {
  buildCertQrPayload,
  buildReceiptQrPayload,
  parseQrPayload,
  qrSvgDataUrl,
  signQrPayload,
  verifyQrSignature,
  isSignedPayload,
} from "./qr-code.js";
import { computeDeviceFingerprint, deviceIdParts, fingerprintTag } from "./device-fingerprint.js";

const KEY = "6f1c9a2e57b08d4c3a91e0f2b7d58c6a4e219f30b8c7d6a5e4f3c2b1a0987654";

describe("device fingerprint (anti-forgery binding)", () => {
  it("is deterministic on the same machine", () => {
    expect(computeDeviceFingerprint()).toBe(computeDeviceFingerprint());
    expect(computeDeviceFingerprint()).toMatch(/^[0-9A-F]{16}$/);
  });

  it("differs when hardware identity changes", () => {
    const parts = deviceIdParts();
    // The last part (memory) is stable; swapping hostname must change the hash.
    const a = computeDeviceFingerprint();
    const other = parts.map((p) => (p.startsWith("host:") ? "host:other-pc" : p)).join("|");
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const b = createHash("sha256").update(other).digest("hex").slice(0, 16).toUpperCase();
    expect(b).not.toBe(a);
  });

  it("produces a short tag for UI badges", () => {
    expect(fingerprintTag("C92336163747BDFD")).toBe("C9233616");
  });
});

describe("signed QR payloads (certificates + receipts)", () => {
  const certFields = {
    number: "MMJM/MB/26/09/001",
    verificationCode: "WK4M-8Q7Z-T3HD",
    fingerprint: "C92336163747BDFD",
    issuedDate: "2026-09-15",
  };

  it("encodes the canonical MMS|CERT format with an HMAC tail", () => {
    const payload = buildCertQrPayload(certFields, KEY);
    const parts = payload.split("|");
    expect(parts).toHaveLength(7);
    expect(parts.slice(0, 6).join("|")).toBe("MMS|CERT|MMJM/MB/26/09/001|WK4M-8Q7Z-T3HD|C92336163747BDFD|2026-09-15");
    expect(parts[6]).toMatch(/^[0-9A-F]{16}$/);
  });

  it("encodes the MMS|RCP receipt format with the same signing rules", () => {
    const payload = buildReceiptQrPayload({ ...certFields, number: "MMJM/26/09/001" }, KEY);
    const parts = payload.split("|");
    expect(parts[1]).toBe("RCP");
    expect(parts[2]).toBe("MMJM/26/09/001");
    expect(verifyQrSignature(parseQrPayload(payload)!, KEY)).toBe(true);
  });

  it("round-trips through parseQrPayload", () => {
    const parsed = parseQrPayload(buildCertQrPayload(certFields, KEY));
    expect(parsed).toEqual({
      version: "MMS",
      kind: "CERT",
      number: "MMJM/MB/26/09/001",
      verificationCode: "WK4M-8Q7Z-T3HD",
      fingerprint: "C92336163747BDFD",
      issuedDate: "2026-09-15",
      signature: expect.any(String),
    });
    expect(isSignedPayload(parsed)).toBe(true);
  });

  it("still builds/accepts the legacy unsigned 6-field form", () => {
    const legacy = buildCertQrPayload(certFields);
    expect(legacy.split("|")).toHaveLength(6);
    const parsed = parseQrPayload(legacy);
    expect(parsed?.number).toBe("MMJM/MB/26/09/001");
    expect(isSignedPayload(parsed)).toBe(false);
    // Unsigned payloads can't pass a signature check (legacy prints skip it).
    expect(verifyQrSignature(parsed, KEY)).toBe(false);
  });

  it("rejects malformed / foreign payloads", () => {
    expect(parseQrPayload("garbage")).toBeNull();
    expect(parseQrPayload("MMS|OTHER|A|B|C|D")).toBeNull();
    expect(parseQrPayload("MMS|CERT|A|B|C")).toBeNull(); // too few fields
    expect(parseQrPayload("MMS|CERT|A|B|C|D|E|F")).toBeNull(); // too many fields
  });

  it("detects any tampering with a signed payload (forgery protection)", () => {
    const payload = buildCertQrPayload(certFields, KEY);
    // Alter the certificate number by one character.
    const tamperedNumber = payload.replace("MMJM/MB/26/09/001", "MMJM/MB/26/09/002");
    expect(verifyQrSignature(parseQrPayload(tamperedNumber)!, KEY)).toBe(false);
    // Alter the date.
    const tamperedDate = payload.replace("2026-09-15", "2026-09-16");
    expect(verifyQrSignature(parseQrPayload(tamperedDate)!, KEY)).toBe(false);
    // Alter the fingerprint (the photocopy/other-machine field).
    const tamperedFp = payload.replace("C92336163747BDFD", "C92336163747BDFE");
    expect(verifyQrSignature(parseQrPayload(tamperedFp)!, KEY)).toBe(false);
    // A wrong key never validates a genuine payload.
    expect(verifyQrSignature(parseQrPayload(payload)!, KEY.slice(0, 63) + "0")).toBe(false);
    // The genuine payload always validates.
    expect(verifyQrSignature(parseQrPayload(payload)!, KEY)).toBe(true);
  });

  it("signs deterministically — same fields + key, same tag", () => {
    const base = "MMS|CERT|MMJM/MB/26/09/001|WK4M-8Q7Z-T3HD|C92336163747BDFD|2026-09-15";
    expect(signQrPayload(base, KEY)).toBe(signQrPayload(base, KEY));
    expect(signQrPayload(base, KEY)).not.toBe(signQrPayload(base.replace("T3HD", "T3HE"), KEY));
  });

  it("generates an SVG data URL", async () => {
    const svg = await qrSvgDataUrl(buildCertQrPayload(certFields, KEY));
    expect(svg.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const decoded = Buffer.from(svg.slice(svg.indexOf(",") + 1), "base64").toString("utf8");
    expect(decoded).toContain("<svg");
  });
});
