import { app, ipcMain } from "electron";
import path from "node:path";
import * as data from "./services/data.service.js";
import { changePassword } from "./services/auth.service.js";
import { security, type Actor } from "./services/security.service.js";
import { createBackup, listBackups, verifyBackup, extractVerifiedBackup } from "./services/backup.service.js";
import { closeDB, getDB } from "./db/connection.js";

type ActorProvider = () => Actor | null;
function register(name: string, handler: (...args: any[]) => any) { try { ipcMain.removeHandler(name); } catch {} ipcMain.handle(name, async (_event, ...args) => handler(...args)); }

export function registerSecurityIpc(getActor: ActorProvider) {
  const actor = (): Actor => { const current=getActor(); if(!current) throw new Error("Authentication is required for this operation"); return current; };
  const admin = (): Actor => { const current = actor(); if (current.role !== "Administrator") throw new Error("Administrator permission is required for this operation"); return current; };

  // The legacy main-process password handler is replaced here so a stale
  // renderer call after logout can never reuse auth.service's old actor state.
  register("auth:changePassword", (userId:number,newPassword:string)=>{
    const a = actor();
    if (userId !== a.id && a.role !== "Administrator") throw new Error("You can only change your own password");
    changePassword(userId,newPassword);
    return { success:true };
  });

  // Core household security rules.
  register("families:update", (id:number,data:any)=>security.updateFamily(actor(),id,data));
  register("members:update", (id:number,data:any)=>security.updateMember(actor(),id,data));
  register("families:remove", ()=>{throw new Error("Families cannot be permanently deleted. Archive the family instead.");});
  register("members:remove", ()=>{throw new Error("Members cannot be permanently deleted. Archive the member instead.");});
  register("marriages:remove", ()=>{throw new Error("Marriage records cannot be permanently deleted. Correct or revoke the record instead.");});
  register("deaths:remove", ()=>{throw new Error("Death records cannot be permanently deleted. Correct or revoke the record instead.");});
  register("certificates:remove", ()=>{throw new Error("Issued certificates cannot be permanently deleted. Revoke the certificate instead.");});

  // Require a logged-in actor for every application mutation. The renderer must
  // never be able to create/update records as the fallback user id 1.
  register("families:create", (d:any)=>{actor();return data.families.create(d);});
  register("members:create", (d:any)=>{actor();return data.members.create(d);});
  register("subscriptions:create", (d:any)=>{const a=actor();return data.subscriptions.create({...d,collectedBy:a.id});});
  register("subscriptions:update", (id:number,d:any)=>{actor();return data.subscriptions.update(id,d);});
  register("subscriptions:remove", (id:number)=>{admin();return data.subscriptions.remove(id);});
  register("subscriptions:markOverdue", ()=>{actor();return data.subscriptions.markOverdue();});
  register("donations:create", (d:any)=>{const a=actor();return data.donations.create({...d,receivedBy:a.id});});
  register("donations:update", (id:number,d:any)=>{actor();return data.donations.update(id,d);});
  register("donations:remove", (id:number)=>{admin();return data.donations.remove(id);});
  register("accounting:create", (d:any)=>{const a=actor();return data.accounting.create({...d,createdBy:a.id});});
  register("accounting:update", (id:number,d:any)=>{actor();return data.accounting.update(id,d);});
  register("accounting:remove", (id:number)=>{admin();return data.accounting.remove(id);});
  register("marriages:create", (d:any)=>{const a=actor();return data.marriages.create({...d,createdBy:a.id});});
  register("marriages:update", (id:number,d:any)=>{actor();return data.marriages.update(id,d);});
  register("deaths:create", (d:any)=>{actor();return data.deaths.create(d);});
  register("deaths:update", (id:number,d:any)=>{actor();return data.deaths.update(id,d);});
  register("welfare:create", (d:any)=>{const a=actor();return data.welfare.create({...d,createdBy:a.id});});
  register("welfare:update", (id:number,d:any)=>{actor();return data.welfare.update(id,d);});
  register("welfare:approve", (id:number,amount:number,remarks:string)=>data.welfare.approve(id,amount,remarks,actor().id));
  register("welfare:reject", (id:number,reason:string)=>data.welfare.reject(id,reason,actor().id));
  register("welfare:disburse", (id:number)=>data.welfare.disburse(id,actor().id));
  register("welfare:remove", (id:number)=>{admin();return data.welfare.remove(id);});

  // Official registers are historical records. They are never physically deleted.
  register("certificates:issueMembership", (code:string)=>data.certificates.issueMembership(code,actor().id));
  register("certificates:issueResidence", (familyNum:string,issuedTo:string)=>data.certificates.issueResidence(familyNum,issuedTo,actor().id));
  register("certificates:issueMarriage", (marriageNum:string)=>data.certificates.issueMarriage(marriageNum,actor().id));
  register("certificates:issueDeath", (deathNum:string)=>data.certificates.issueDeath(deathNum,actor().id));

  // User administration is Administrator-only. Password changes for the
  // currently logged-in user remain available through auth:changePassword.
  register("users:list", ()=>{admin();return data.users.list();});
  register("users:create", (d:any)=>data.users.create(d,admin().role));
  register("users:update", (id:number,d:any)=>{admin();return data.users.update(id,d);});
  register("users:toggleLock", (id:number,locked:boolean)=>{admin();return data.users.toggleLock(id,locked);});
  register("users:resetPassword", (id:number,p:string)=>{admin();return data.users.resetPassword(id,p);});
  register("users:remove", (id:number)=>{admin();return data.users.remove(id);});
  register("audit:list", (filter:any)=>{actor();return data.audit.list(filter||{});});
  register("settings:save", (d:any)=>{admin();return data.settings.save(d);});

  // Token lifecycle operations require an authenticated actor. Destructive
  // removal is re-registered below with the stronger administrator + expiry +
  // atomic-audit rules.
  register("tokens:createEvent", (d:any)=>{actor();return data.tokens.createEvent(d);});
  register("tokens:updateEvent", (id:number,d:any)=>{actor();return data.tokens.updateEvent(id,d);});
  register("tokens:generate", (eventId:number,familyIds:number[])=>data.tokens.generate(eventId,familyIds,actor().id));
  register("tokens:collect", (tokenId:number)=>data.tokens.collect(tokenId,actor().id));
  register("tokens:cancel", (tokenId:number,reason:string)=>{actor();return data.tokens.cancel(tokenId,reason);});
  register("tokens:replace", (tokenId:number,reason:string)=>data.tokens.replace(tokenId,reason,actor().id));

  // Temporary event tokens are the only historical data allowed to be removed.
  // This deliberately re-registers the same IPC channel used by the renderer so
  // the insecure legacy handler in main.ts is replaced before the window opens.
  // Authorization, event expiry, reason validation, deletion and audit logging
  // all happen in this single transaction.
  register("tokens:remove", (tokenId:number, reason:string) => {
    const a = admin();
    if (!Number.isInteger(tokenId) || tokenId <= 0) throw new Error("Invalid token");
    if (!reason?.trim()) throw new Error("A deletion reason is required");

    const db = getDB();
    const token = db.prepare(`
      SELECT ta.id, ta.token_code, ta.status, ta.event_id, ta.family_id,
             te.event_name, te.event_date, te.event_time,
             f.family_number
      FROM token_assignments ta
      JOIN token_events te ON te.id = ta.event_id
      LEFT JOIN families f ON f.id = ta.family_id
      WHERE ta.id = ?
    `).get(tokenId) as any;
    if (!token) throw new Error("Token not found");

    // Event expiry is based on the local machine's calendar/time, not UTC.
    const eventDate = String(token.event_date || "");
    const eventTime = String(token.event_time || "").trim();
    if (!eventDate) throw new Error("Token event has no valid date");
    const eventMoment = eventTime
      ? new Date(`${eventDate}T${/^\d{2}:\d{2}$/.test(eventTime) ? `${eventTime}:00` : eventTime}`)
      : new Date(`${eventDate}T23:59:59`);
    if (Number.isNaN(eventMoment.getTime()) || eventMoment >= new Date()) {
      throw new Error("Tokens can only be deleted after the event has ended");
    }

    const tx = db.transaction(() => {
      const metadata = JSON.stringify({
        tokenCode: token.token_code,
        eventId: token.event_id,
        eventName: token.event_name,
        eventDate: token.event_date,
        eventTime: token.event_time || null,
        familyId: token.family_id,
        familyNumber: token.family_number || null,
        previousStatus: token.status,
        deletionType: "temporary_token_after_event",
      });

      db.prepare(`
        INSERT INTO audit_log
          (user_id, username, action, module, entity_id, description, metadata, created_at)
        VALUES (?, ?, 'DELETE', 'tokens', ?, ?, ?, datetime('now'))
      `).run(
        a.id,
        a.username,
        token.id,
        `Temporary token ${token.token_code} deleted after event ${token.event_name}`,
        metadata,
      );

      db.prepare("DELETE FROM token_assignments WHERE id = ?").run(token.id);
    });

    tx();
    return { success: true, tokenId: token.id };
  });

  register("security:archiveFamily",(id:number,reason:string)=>security.archiveFamily(actor(),id,reason));
  register("security:restoreFamily",(id:number,reason?:string)=>security.restoreFamily(actor(),id,reason||""));
  register("security:archiveMember",(id:number,reason:string)=>security.archiveMember(actor(),id,reason));
  register("security:restoreMember",(id:number,reason?:string)=>security.restoreMember(actor(),id,reason||""));
  register("security:familyHistory",(id:number,limit?:number)=>security.history("family",id,limit||100));
  register("security:memberHistory",(id:number,limit?:number)=>security.history("member",id,limit||100));
  register("security:memberMoveHistory",(id:number)=>security.familyMoveHistory(id));
  register("security:moveMembers",(ids:number[],familyId:number,reason:string,moveType?:"ExistingFamily"|"NewFamily")=>security.moveMembers(actor(),ids,familyId,reason,moveType||"ExistingFamily"));
  register("security:createFamilyFromMembers",(ids:number[],familyData:any,headMemberId:number,reason:string)=>security.createFamilyFromMembers(actor(),ids,familyData,headMemberId,reason));

  register("backup:create", async (destination?:string)=>{
    admin();
    const file=destination||path.join(app.getPath("userData"),`backup-${new Date().toISOString().replace(/[:.]/g,"-")}.mmbak`);
    return createBackup(file);
  });
  register("backup:list",()=>{actor();return {success:true,backups:listBackups(app.getPath("userData"))};});
  register("backup:verify",(file:string)=>{actor();return verifyBackup(file);});
  register("backup:restore",(file:string)=>{
    admin();
    const current=path.join(app.getPath("userData"),"pre-restore-backup.mmbak");
    createBackup(current);
    const target=path.join(app.getPath("userData"),"mms.db");
    closeDB(); extractVerifiedBackup(file,target);
    app.relaunch(); app.exit(0);
    return {success:true};
  });
}
