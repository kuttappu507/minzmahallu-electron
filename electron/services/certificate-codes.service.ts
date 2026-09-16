/*
 * Certificate verification-code provisioning.
 *
 * ALL databases (not demo-only): mint a verification code for every existing
 * certificate that is missing one. Certificates issued by builds before the
 * anti-forgery feature carry no code — and a certificate without a code
 * prints with NO verify box and NO QR at all. Runs once at startup:
 * additive, idempotent (coded rows are skipped), and issued codes never
 * change. Returns how many codes were assigned.
 */
import { makeVerificationCode } from "./codes.js";

type DB = { prepare(q: string): { get(...a: any[]): any; all(...a: any[]): any[]; run(...a: any[]): any } };

export function provisionCertificateVerificationCodes(db: DB): number {
  let assigned = 0;
  try {
    db.prepare("BEGIN").run();
    const rows = db
      .prepare("SELECT id FROM certificates WHERE verification_code IS NULL OR verification_code = ''")
      .all() as Array<{ id: number }>;
    for (const r of rows) {
      db.prepare("UPDATE certificates SET verification_code = ? WHERE id = ?").run(makeVerificationCode(), Number(r.id));
      assigned += 1;
    }
    db.prepare("COMMIT").run();
  } catch (err) {
    try { db.prepare("ROLLBACK").run(); } catch { /* already closed */ }
    console.warn("[cert-codes] skipped:", err instanceof Error ? err.message : String(err));
    return 0;
  }
  if (assigned) console.log(`[cert-codes] assigned ${assigned} certificate verification code(s)`);
  return assigned;
}
