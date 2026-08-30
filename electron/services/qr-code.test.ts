import { describe, it, expect } from "vitest";
import { buildQrPayload, parseQrPayload, qrSvgDataUrl } from "./qr-code.js";
import { computeDeviceFingerprint, deviceIdParts, fingerprintTag } from "./device-fingerprint.js";

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

describe("certificate QR payload", () => {
  const payload = buildQrPayload({
    certificateNumber: "CERT-2025-0001",
    verificationCode: "WK4M-8Q7Z-T3HD",
    fingerprint: "C92336163747BDFD",
    issuedDate: "2025-08-15",
  });

  it("encodes the canonical MMS|CERT format", () => {
    expect(payload).toBe("MMS|CERT|CERT-2025-0001|WK4M-8Q7Z-T3HD|C92336163747BDFD|2025-08-15");
  });

  it("round-trips through parseQrPayload", () => {
    const parsed = parseQrPayload(payload);
    expect(parsed).toEqual({
      version: "MMS",
      kind: "CERT",
      certificateNumber: "CERT-2025-0001",
      verificationCode: "WK4M-8Q7Z-T3HD",
      fingerprint: "C92336163747BDFD",
      issuedDate: "2025-08-15",
    });
  });

  it("rejects malformed / foreign payloads", () => {
    expect(parseQrPayload("garbage")).toBeNull();
    expect(parseQrPayload("MMS|OTHER|A|B|C|D")).toBeNull();
    expect(parseQrPayload(payload + "|extra")).toBeNull();
  });

  it("generates an SVG data URL", async () => {
    const svg = await qrSvgDataUrl(payload);
    expect(svg.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const decoded = Buffer.from(svg.slice(svg.indexOf(",") + 1), "base64").toString("utf8");
    expect(decoded).toContain("<svg");
  });
});
