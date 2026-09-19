import { describe, it, expect } from "vitest";
import { canWriteChannel, ROLE_WRITE_ACCESS } from "./roleAccess.js";

describe("roleAccess — bifurcation matrix", () => {
  it("Administrator can write anything", () => {
    expect(canWriteChannel("Administrator", "members:create")).toBe(true);
    expect(canWriteChannel("Administrator", "users:remove")).toBe(true);
    expect(canWriteChannel("Administrator", "settings:save")).toBe(true);
  });

  it("Auditor is view-only (no module writes)", () => {
    expect(canWriteChannel("Auditor", "members:create")).toBe(false);
    expect(canWriteChannel("Auditor", "donations:create")).toBe(false);
    expect(canWriteChannel("Auditor", "staff:paySalary")).toBe(false);
    // …but may read and export everything
    expect(canWriteChannel("Auditor", "members:list")).toBe(true);
    expect(canWriteChannel("Auditor", "accounting:unifiedList")).toBe(true);
  });

  it("Treasurer owns money modules but not the civil registers", () => {
    expect(canWriteChannel("Treasurer", "donations:create")).toBe(true);
    expect(canWriteChannel("Treasurer", "subscriptions:update")).toBe(true);
    expect(canWriteChannel("Treasurer", "accounting:create")).toBe(true);
    expect(canWriteChannel("Treasurer", "staff:setStatus")).toBe(true);
    expect(canWriteChannel("Treasurer", "members:create")).toBe(false);
    expect(canWriteChannel("Treasurer", "committee:update")).toBe(false);
  });

  it("Secretary has FULL power (user request: admin = secretary)", () => {
    expect(canWriteChannel("Secretary", "marriages:create")).toBe(true);
    expect(canWriteChannel("Secretary", "deaths:update")).toBe(true);
    expect(canWriteChannel("Secretary", "tokens:generate")).toBe(true);
    expect(canWriteChannel("Secretary", "certificates:issueMarriage")).toBe(true);
    // Full power: the secretary may also write money records and settings.
    expect(canWriteChannel("Secretary", "accounting:create")).toBe(true);
    expect(canWriteChannel("Secretary", "donations:create")).toBe(true);
    expect(canWriteChannel("Secretary", "settings:save")).toBe(true);
  });

  it("Member views everything and may only hand in donations/subscriptions", () => {
    expect(canWriteChannel("Member", "donations:create")).toBe(true);
    expect(canWriteChannel("Member", "subscriptions:create")).toBe(true);
    expect(canWriteChannel("Member", "members:create")).toBe(false);
    expect(canWriteChannel("Member", "families:create")).toBe(false);
    expect(canWriteChannel("Member", "accounting:create")).toBe(false);
    expect(canWriteChannel("Member", "users:resetPassword")).toBe(false);
    // Reads are open to every authenticated role.
    expect(canWriteChannel("Member", "members:list")).toBe(true);
    expect(canWriteChannel("Member", "dashboard:summary")).toBe(true);
  });

  it("Staff writes the people registers + money, but not users/settings", () => {
    expect(canWriteChannel("Staff", "members:create")).toBe(true);
    expect(canWriteChannel("Staff", "families:create")).toBe(true);
    expect(canWriteChannel("Staff", "marriages:create")).toBe(true);
    expect(canWriteChannel("Staff", "deaths:create")).toBe(true);
    expect(canWriteChannel("Staff", "donations:create")).toBe(true);
    expect(canWriteChannel("Staff", "subscriptions:create")).toBe(true);
    expect(canWriteChannel("Staff", "users:create")).toBe(false);
    expect(canWriteChannel("Staff", "settings:save")).toBe(false);
  });

  it("housekeeping channels that run on page load are never blocked", () => {
    expect(canWriteChannel("Auditor", "subscriptions:ensureCurrentMonth")).toBe(true);
    expect(canWriteChannel("Auditor", "subscriptions:markOverdue")).toBe(true);
  });

  it("cross-module receipt sends are always allowed (parent module gates them)", () => {
    expect(canWriteChannel("Auditor", "whatsapp:sendDonationReceipt")).toBe(true);
    expect(canWriteChannel("Secretary", "whatsapp:sendSubscriptionReceipt")).toBe(true);
  });

  it("unmapped channels stay open for authenticated users", () => {
    expect(canWriteChannel("Auditor", "dashboard:summary")).toBe(true);
    expect(canWriteChannel("Staff", "audit:list")).toBe(true);
  });

  it("every declared role has a matrix entry", () => {
    for (const role of ["Administrator", "President", "Secretary", "Treasurer", "Imam", "Staff", "Auditor"]) {
      expect(ROLE_WRITE_ACCESS[role]).toBeDefined();
    }
  });
});
