import { describe, it, expect } from "vitest";
import { passwordPolicyError, stripIpcWrapper, friendlyAuthError, localizedPolicyError } from "@/lib/pwd";

const tEn = (key: string) =>
  ({
    pwd_policy_min: "Password must be at least 8 characters",
    pwd_policy_complex: "Password must include uppercase, lowercase, a number and a special character",
    auth_incorrect_password: "Incorrect administrator password",
    auth_invalid_credentials: "Invalid username or password",
    auth_locked: "Too many failed attempts — account locked. Try again later.",
    auth_inactive: "Account is inactive — contact administrator",
    ui_failed_save: "Failed to save",
  } as Record<string, string>)[key] ?? key;

describe("passwordPolicyError", () => {
  it("flags short passwords as pwd_policy_min", () => {
    expect(passwordPolicyError("")).toBe("pwd_policy_min");
    expect(passwordPolicyError("Ab1@")).toBe("pwd_policy_min");
    expect(passwordPolicyError("Ab1@ab1")).toBe("pwd_policy_min"); // 7 chars
  });

  it("flags missing character classes as pwd_policy_complex", () => {
    expect(passwordPolicyError("alllowercase1!")).toBe("pwd_policy_complex"); // no upper
    expect(passwordPolicyError("ALLUPPERCASE1!")).toBe("pwd_policy_complex"); // no lower
    expect(passwordPolicyError("NoDigitsHere!")).toBe("pwd_policy_complex"); // no digit
    expect(passwordPolicyError("NoSpecial123")).toBe("pwd_policy_complex"); // no special
  });

  it("accepts policy-compliant passwords", () => {
    expect(passwordPolicyError("Admin@2026")).toBeNull();
    expect(passwordPolicyError("Str0ng!Pass")).toBeNull();
  });
});

describe("stripIpcWrapper", () => {
  it("strips Electron's 'Error invoking remote method' wrapper", () => {
    const raw = "Error invoking remote method 'auth:changePassword': Error: Password must be at least 8 characters";
    expect(stripIpcWrapper(raw)).toBe("Password must be at least 8 characters");
  });

  it("strips a bare Error: prefix", () => {
    expect(stripIpcWrapper("Error: Incorrect administrator password")).toBe("Incorrect administrator password");
  });

  it("leaves plain messages untouched", () => {
    expect(stripIpcWrapper("Incorrect administrator password")).toBe("Incorrect administrator password");
  });
});

describe("friendlyAuthError", () => {
  it("maps the IPC-wrapped rotation failure to the localized policy message", () => {
    // EXACT shape the renderer used to print verbatim (the reported bug).
    const raw = "Error invoking remote method 'auth:changePassword': Error: Password must be at least 8 characters";
    expect(friendlyAuthError(new Error(raw), tEn)).toBe("Password must be at least 8 characters");
  });

  it("maps the complexity failure to the localized message", () => {
    const raw = "Error invoking remote method 'auth:changePassword': Error: Password must include uppercase, lowercase, digit, and special character";
    expect(friendlyAuthError(raw, tEn)).toBe("Password must include uppercase, lowercase, a number and a special character");
  });

  it("localizes the administrator re-auth rejection", () => {
    const raw = "Error invoking remote method 'auth:verifyAdminPassword': Error: Incorrect administrator password";
    expect(friendlyAuthError(raw, tEn)).toBe("Incorrect administrator password");
  });

  it("localizes login failures (invalid credentials, lockout, inactive)", () => {
    expect(friendlyAuthError("Invalid username or password", tEn)).toBe("Invalid username or password");
    expect(friendlyAuthError("Too many failed login attempts — try again later", tEn)).toBe("Too many failed attempts — account locked. Try again later.");
    expect(friendlyAuthError("Account is inactive — contact administrator", tEn)).toBe("Account is inactive — contact administrator");
  });

  it("reads structured {success:false,error} results", () => {
    expect(friendlyAuthError({ success: false, error: "Password must be at least 8 characters" }, tEn)).toBe("Password must be at least 8 characters");
  });

  it("falls back to the cleaned raw text for unknown messages", () => {
    const raw = "Error invoking remote method 'families:remove': Error: Families cannot be permanently deleted. Archive the family instead.";
    expect(friendlyAuthError(raw, tEn)).toBe("Families cannot be permanently deleted. Archive the family instead.");
  });

  it("falls back to ui_failed_save when nothing usable arrives", () => {
    expect(friendlyAuthError(undefined, tEn)).toBe("Failed to save");
    expect(friendlyAuthError("", tEn)).toBe("Failed to save");
  });
});

describe("localizedPolicyError", () => {
  it("returns the translated rule message for weak passwords", () => {
    expect(localizedPolicyError("short", tEn)).toBe("Password must be at least 8 characters");
    expect(localizedPolicyError("onlylowercase", tEn)).toBe("Password must include uppercase, lowercase, a number and a special character");
  });

  it("returns null for compliant passwords", () => {
    expect(localizedPolicyError("Compliant!1", tEn)).toBeNull();
  });
});
