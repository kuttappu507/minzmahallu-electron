import type { useI18n } from "@/i18n";

/**
 * Shared password-policy + error-presentation helpers.
 *
 * WHY THIS EXISTS (bug report): the forced password-rotation screen (V035)
 * validates the new password in the MAIN process. When validation fails, the
 * IPC handler used to THROW, and Electron wraps every rejected invoke into
 *   "Error invoking remote method 'auth:changePassword': Error: Password must be at least 8 characters"
 * That raw technical string — English-only, IPC-prefixed — was shown to the
 * user verbatim. These helpers give every password screen:
 *   1. a client-side policy check with LOCALIZED messages (no round-trip), and
 *   2. friendlyAuthError(), which strips the Electron wrapper and maps the
 *      known English policy messages onto localized i18n keys for anything
 *      that still arrives as a raw error.
 */

/** The real policy enforced main-process side (security-ipc.ts validatePassword
 *  + auth.service validatePassword): 8+ chars with upper, lower, digit, special. */
export function passwordPolicyError(pwd: string): "pwd_policy_min" | "pwd_policy_complex" | null {
  if (!pwd || pwd.length < 8) return "pwd_policy_min";
  if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/\d/.test(pwd) || !/[^A-Za-z0-9]/.test(pwd)) {
    return "pwd_policy_complex";
  }
  return null;
}

type Translate = (key: string) => string;

/** Keys this helper can produce — keep in sync with src/i18n/index.ts. */
const POLICY_MESSAGE_MAP: Array<{ match: RegExp; key: string }> = [
  { match: /password must be at least 8/i, key: "pwd_policy_min" },
  { match: /uppercase, lowercase/i, key: "pwd_policy_complex" },
  { match: /incorrect administrator password/i, key: "auth_incorrect_password" },
  { match: /invalid username or password/i, key: "auth_invalid_credentials" },
  { match: /too many failed login attempts|account is locked/i, key: "auth_locked" },
  { match: /account is inactive/i, key: "auth_inactive" },
  // Role bifurcation denial thrown by security-ipc's register() wrapper.
  { match: /can view this section but cannot change|does not allow changing this record/i, key: "usr_role_access_denied" },
];

/** Electron rejects a failed invoke with
 *  "Error invoking remote method '<channel>': Error: <actual message>".
 *  Strip the wrapper so only the human-readable part remains. */
export function stripIpcWrapper(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^(?:Error|TypeError|RangeError):\s*/i, "")
    .trim();
}

/** Turn any password/auth error (raw throw, IPC-wrapped, or structured
 *  {success:false,error}) into a clean LOCALIZED sentence. `t` comes from
 *  useI18n(); it returns the key itself for unknown keys, which we use to
 *  detect misses and fall back to the cleaned raw text. */
export function friendlyAuthError(err: unknown, t: Translate): string {
  const raw =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : (err as any)?.error || (err as any)?.message || "";
  const cleaned = stripIpcWrapper(String(raw || ""));
  if (!cleaned) return t("ui_failed_save");
  for (const { match, key } of POLICY_MESSAGE_MAP) {
    if (match.test(cleaned)) {
      const localized = t(key);
      if (localized && localized !== key) return localized;
    }
  }
  return cleaned;
}

/** Convenience for call sites: validate + translate in one step. Returns null
 *  when the password satisfies the policy. */
export function localizedPolicyError(pwd: string, t: Translate): string | null {
  const key = passwordPolicyError(pwd);
  return key ? t(key) : null;
}
