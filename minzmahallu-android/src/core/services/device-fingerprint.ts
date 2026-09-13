/*
 * Device fingerprint — anti-forgery binding for official prints.
 *
 * Every issued certificate and receipt embeds a QR carrying a hash of the
 * device's stable identifiers. A document printed on another device (or a
 * photocopy carrying a forged code) has a different fingerprint, so the print
 * can be re-checked against the fingerporint stored in settings.
 *
 * Android has no MAC/CPU strings to read, so the identity comes from the
 * platform adapter: Android ID + device model + OS build + a per-install random
 * id (see platform/native.ts). The OUTPUT FORMAT is unchanged — 16 hex
 * characters — so payloads printed by the desktop build keep verifying.
 *
 * Pure (platform + sha256 only): no DB, no Electron, unit-testable.
 */
import { platform } from "../platform/index.js";
import { sha256Hex } from "../platform/crypto.js";

/** Stable device identifiers, sorted so ordering never changes the hash. */
export async function deviceIdParts(): Promise<string[]> {
  const host = await platform();
  const parts = await host.device.identityParts();
  return [...parts].sort();
}

/** 16-hex-character uppercase SHA-256 fingerprint of this device. */
export async function computeDeviceFingerprint(): Promise<string> {
  const parts = await deviceIdParts();
  return sha256Hex(parts.join("|")).slice(0, 16).toUpperCase();
}

/** Human-friendly 8-hex short tag (for badges/UI), derived from the fingerprint. */
export function fingerprintTag(fp: string): string {
  return (fp || "").slice(0, 8);
}
