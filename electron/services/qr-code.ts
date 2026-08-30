/*
 * QR helpers — anti-forgery QR for official prints.
 * Wraps the `qrcode` package (pure JS) with the MMS payload format:
 *
 *   MMS|CERT|<certificate_number>|<verification_code>|<device_fingerprint>|<issued_date>
 *
 * The payload binds the print to the machine that issued it (fingerprint) and
 * to the register (verification code). Any phone can scan the QR to read the
 * code; the app can re-verify the payload against the DB + device fingerprint.
 */
import QRCode from "qrcode";

export type QrPayload = {
  version: string;
  kind: string;
  certificateNumber: string;
  verificationCode: string;
  fingerprint: string;
  issuedDate: string;
};

/** Build the canonical QR payload string for a certificate print. */
export function buildQrPayload(args: {
  certificateNumber: string;
  verificationCode: string;
  fingerprint: string;
  issuedDate: string;
}): string {
  return ["MMS", "CERT", args.certificateNumber, args.verificationCode, args.fingerprint, args.issuedDate].join("|");
}

/** Parse a scanned/entered QR payload. Returns null when malformed. */
export function parseQrPayload(payload: string): QrPayload | null {
  const parts = String(payload || "").trim().split("|");
  if (parts.length !== 6 || parts[0] !== "MMS" || parts[1] !== "CERT") return null;
  return {
    version: parts[0],
    kind: parts[1],
    certificateNumber: parts[2],
    verificationCode: parts[3],
    fingerprint: parts[4],
    issuedDate: parts[5],
  };
}

/** SVG data-URL of the QR for a payload (for embedding in print HTML / UI). */
export async function qrSvgDataUrl(payload: string): Promise<string> {
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 180, color: { dark: "#0e7c5b", light: "#ffffff" } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
