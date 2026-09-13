/*
 * Verification-code helper for issued certificates (anti-forgery).
 * Pure and platform-neutral: the CSPRNG comes from the platform crypto layer
 * (WebCrypto on Android, node:crypto under test), so codes are never
 * predictable and the alphabet/format match the desktop build exactly.
 */
import { randomInt } from "../platform/crypto.js";

// Ambiguity-free alphabet (no 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeVerificationCode(groups = 3, groupLen = 4): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let part = "";
    for (let i = 0; i < groupLen; i++) {
      part += ALPHABET[randomInt(ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}
