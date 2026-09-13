/* ============================================================================
 * Crypto primitives for the Android edition.
 *
 * The desktop app used node:crypto (createHash / createHmac / pbkdf2Sync /
 * randomBytes). Inside an Android WebView node:crypto does not exist, so this
 * module provides the same primitives on top of the Web platform — and every
 * byte-format (hex digests, base64 salts, the `pbkdf2_sha256$iter$salt$hash`
 * password string, HMAC tags) is IDENTICAL, because databases travel between
 * the desktop and Android builds via backup/restore.
 *
 *   · sha256Hex / hmacSha256Hex  — synchronous, pure JS (used inside SQLite
 *     transactions for the tamper-evident audit chain, where an async call is
 *     not possible).
 *   · pbkdf2Sha256               — async, WebCrypto (200 000 iterations run in
 *     native code, ~1 ms, instead of seconds in JS). Pure-JS fallback included
 *     for the rare WebView without subtle crypto.
 *   · randomBytes / randomInt    — CSPRNG from crypto.getRandomValues.
 * ========================================================================== */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Raw SHA-256 digest (32 bytes). */
export function sha256Bytes(input: string | Uint8Array): Uint8Array {
  const msg = typeof input === "string" ? utf8Bytes(input) : input;
  const len = msg.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = len * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
}

/** Lowercase hex SHA-256 — drop-in replacement for crypto.createHash("sha256"). */
export function sha256Hex(input: string | Uint8Array): string {
  return toHex(sha256Bytes(input));
}

/** HMAC-SHA256 (64-byte block, raw tag). */
export function hmacSha256Bytes(key: string | Uint8Array, message: string | Uint8Array): Uint8Array {
  let k = typeof key === "string" ? utf8Bytes(key) : key;
  if (k.length > 64) k = sha256Bytes(k);
  const block = new Uint8Array(64);
  block.set(k);
  const inner = new Uint8Array(64);
  const outer = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { inner[i] = block[i] ^ 0x36; outer[i] = block[i] ^ 0x5c; }
  const msg = typeof message === "string" ? utf8Bytes(message) : message;
  const first = sha256Bytes(concat(inner, msg));
  return sha256Bytes(concat(outer, first));
}

/** Lowercase hex HMAC-SHA256 — drop-in for crypto.createHmac("sha256", key). */
export function hmacSha256Hex(key: string | Uint8Array, message: string | Uint8Array): string {
  return toHex(hmacSha256Bytes(key, message));
}

/** The Web Crypto implementation, when the runtime has one. */
function subtle(): SubtleCrypto | null {
  const c = (globalThis as any).crypto;
  return c && c.subtle ? (c.subtle as SubtleCrypto) : null;
}

/**
 * PBKDF2-HMAC-SHA256 → keyLen bytes. Uses WebCrypto (native speed for the
 * 200 000 iterations the password policy uses) and falls back to a pure-JS
 * implementation only if the WebView exposes no subtle crypto.
 */
export async function pbkdf2Sha256(
  password: string | Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keyLen: number
): Promise<Uint8Array> {
  const pwBytes = typeof password === "string" ? utf8Bytes(password) : password;
  const s = subtle();
  if (s) {
    const key = await s.importKey("raw", pwBytes as unknown as BufferSource, "PBKDF2", false, ["deriveBits"]);
    const bits = await s.deriveBits(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
      key,
      keyLen * 8
    );
    return new Uint8Array(bits);
  }
  return pbkdf2Sha256Fallback(pwBytes, salt, iterations, keyLen);
}

/** Pure-JS PBKDF2 (only used when WebCrypto is unavailable). */
export function pbkdf2Sha256Fallback(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number): Uint8Array {
  const out = new Uint8Array(keyLen);
  const blocks = Math.ceil(keyLen / 32);
  let offset = 0;
  for (let block = 1; block <= blocks; block++) {
    const counter = new Uint8Array(4);
    new DataView(counter.buffer).setUint32(0, block);
    let u = hmacSha256Bytes(password, concat(salt, counter));
    const t = u.slice();
    for (let i = 1; i < iterations; i++) {
      u = hmacSha256Bytes(password, u);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    const take = Math.min(32, keyLen - offset);
    out.set(t.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/** Cryptographically strong random bytes. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) { c.getRandomValues(out); return out; }
  // Last-resort entropy (never hit on Android/Chromium, kept for old runtimes).
  for (let i = 0; i < length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Uniform random integer in [0, max) — replaces node:crypto randomInt. */
export function randomInt(max: number): number;
export function randomInt(min: number, max: number): number;
export function randomInt(min: number, max?: number): number {
  const low = max === undefined ? 0 : min;
  const high = max === undefined ? min : max;
  const range = high - low;
  if (range <= 0) throw new Error("randomInt: range must be positive");
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0x100000000 / range) * range;
  const buf = new Uint32Array(1);
  for (;;) {
    const c = (globalThis as any).crypto;
    if (c?.getRandomValues) c.getRandomValues(buf);
    else buf[0] = Math.floor(Math.random() * 0x100000000);
    if (buf[0] < limit) return low + (buf[0] % range);
  }
}

/** Constant-time equality (replaces crypto.timingSafeEqual). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Encoding helpers (browser-safe replacements for the Buffer calls)
// ---------------------------------------------------------------------------

export function utf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = text.charCodeAt(++i);
      c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}

export function utf8String(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

const HEX = "0123456789abcdef";
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    if (b1 === undefined) { out += "="; out += "="; break; }
    out += B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    if (b2 === undefined) { out += "="; break; }
    out += B64[b2 & 63];
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = String(text || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buffer = 0, bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buffer >> bits) & 0xff; }
  }
  return out.subarray(0, o);
}

export function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
