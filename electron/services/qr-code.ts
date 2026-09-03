/*
 * QR helpers — anti-forgery QR for official prints (certificates AND receipts).
 * Wraps the `qrcode` package (pure JS) with the MMS payload format:
 *
 *   MMS|CERT|<certificate_number>|<verification_code>|<device_fingerprint>|<issued_date>[|<hmac>]
 *   MMS|RCP |<receipt_number>    |<verification_code>|<device_fingerprint>|<issued_date>[|<hmac>]
 *
 * The payload binds the print to the machine that issued it (fingerprint) and
 * to the register (verification code). Any phone can scan the QR to read the
 * code; the app can re-verify the payload against the DB + device fingerprint.
 *
 * SIGNED QR (tamper-proofing): when a signing key is supplied, an HMAC-SHA256
 * tag over the first six fields is appended as a seventh field. The key lives
 * only in the mahallu's app database — it is never printed — so an outsider
 * can clone an existing QR but cannot ALTER any field (number, code, date,
 * fingerprint) or MINT a new valid one: the tag stops matching. Payloads
 * printed by earlier builds (six fields, no tag) still parse and verify
 * against the register; they are simply reported as unsigned/legacy.
 */
import QRCode from "qrcode";
import crypto from "node:crypto";

/** Payload kinds — certificates and (money) receipts. */
export const QR_KIND_CERT = "CERT";
export const QR_KIND_RECEIPT = "RCP";

export type QrPayload = {
  version: string;
  kind: string; // "CERT" | "RCP"
  /** Certificate number or receipt number. */
  number: string;
  verificationCode: string;
  fingerprint: string;
  issuedDate: string;
  /** Present on signed payloads (7 fields). */
  signature?: string;
};

/** Fields shared by every payload kind (kind added by the builder). */
export type QrFields = {
  number: string;
  verificationCode: string;
  fingerprint: string;
  issuedDate: string;
};

/** HMAC-SHA256(key, first-six-fields) → 16 hex chars. Short keeps the QR
 *  dense-printable while 64 bits of tag makes silent forgery impractical. */
export function signQrPayload(sixPartPayload: string, key: string): string {
  return crypto.createHmac("sha256", String(key || "")).update(sixPartPayload).digest("hex").slice(0, 16).toUpperCase();
}

/** Build the payload string for a certificate print (signed when key given). */
export function buildCertQrPayload(args: QrFields, key?: string): string {
  const base = ["MMS", QR_KIND_CERT, args.number, args.verificationCode, args.fingerprint, args.issuedDate].join("|");
  return key ? `${base}|${signQrPayload(base, key)}` : base;
}

/** Build the payload string for a receipt print (signed when key given). */
export function buildReceiptQrPayload(args: QrFields, key?: string): string {
  const base = ["MMS", QR_KIND_RECEIPT, args.number, args.verificationCode, args.fingerprint, args.issuedDate].join("|");
  return key ? `${base}|${signQrPayload(base, key)}` : base;
}

/** Parse a scanned/entered QR payload. Accepts the signed 7-field form and
 *  the legacy unsigned 6-field form; returns null when malformed. */
export function parseQrPayload(payload: string): QrPayload | null {
  const parts = String(payload || "").trim().split("|");
  if ((parts.length !== 6 && parts.length !== 7) || parts[0] !== "MMS") return null;
  if (parts[1] !== QR_KIND_CERT && parts[1] !== QR_KIND_RECEIPT) return null;
  return {
    version: parts[0],
    kind: parts[1],
    number: parts[2],
    verificationCode: parts[3],
    fingerprint: parts[4],
    issuedDate: parts[5],
    signature: parts.length === 7 ? parts[6] : undefined,
  };
}

/** True when the payload carries an HMAC tag. */
export function isSignedPayload(parsed: QrPayload | null): boolean {
  return !!parsed?.signature;
}

/** Re-check a parsed payload's HMAC tag against the app's signing key. */
export function verifyQrSignature(parsed: QrPayload | null, key: string): boolean {
  if (!parsed || !parsed.signature) return false;
  const base = ["MMS", parsed.kind, parsed.number, parsed.verificationCode, parsed.fingerprint, parsed.issuedDate].join("|");
  return signQrPayload(base, key) === parsed.signature.toUpperCase();
}

/** SVG data-URL of the QR for a payload (for embedding in print HTML / UI). */
export async function qrSvgDataUrl(payload: string): Promise<string> {
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1, width: 180, color: { dark: "#0e7c5b", light: "#ffffff" } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
