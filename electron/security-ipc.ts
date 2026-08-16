import { app, ipcMain } from "electron";
import path from "node:path";
import { security, type Actor } from "./services/security.service.js";
import { createBackup, listBackups, verifyBackup, extractVerifiedBackup } from "./services/backup.service.js";
import { closeDB } from "./db/connection.js";

type ActorProvider = () => Actor | null;
function register(name: string, handler: (...args: any[]) => any) { try { ipcMain.removeHandler(name); } catch {} ipcMain.handle(name, async (_event, ...args) => handler(...args)); }

export function registerSecurityIpc(getActor: ActorProvider) {
  const actor = (): Actor => { const current=getActor(); if(!current) throw new Error("Authentication is required for this operation"); return current; };
  register("families:update", (id:number,data:any)=>security.updateFamily(actor(),id,data));
  register("members:update", (id:number,data:any)=>security.updateMember(actor(),id,data));
  register("families:remove", ()=>{throw new Error("Families cannot be permanently deleted. Archive the family instead.");});
  register("members:remove", ()=>{throw new Error("Members cannot be permanently deleted. Archive the member instead.");});

  // Official registers are historical records. They are never physically deleted.
  // Corrections must be made through an audited edit/revocation workflow.
  register("marriages:remove", ()=>{throw new Error("Marriage records cannot be permanently deleted. Correct or revoke the record instead.");});
  register("deaths:remove", ()=>{throw new Error("Death records cannot be permanently deleted. Correct or revoke the record instead.");});
  register("certificates:remove", ()=>{throw new Error("Issued certificates cannot be permanently deleted. Revoke the certificate instead.");});

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
    const a=actor();
    if(a.role!=="Administrator") throw new Error("Administrator permission is required for backup");
    const file=destination||path.join(app.getPath("userData"),`backup-${new Date().toISOString().replace(/[:.]/g,"-")}.mmbak`);
    return createBackup(file);
  });
  register("backup:list",()=>{actor();return {success:true,backups:listBackups(app.getPath("userData"))};});
  register("backup:verify",(file:string)=>{actor();return verifyBackup(file);});
  register("backup:restore",(file:string)=>{
    const a=actor(); if(a.role!=="Administrator") throw new Error("Administrator permission is required to restore a backup");
    const current=path.join(app.getPath("userData"),"pre-restore-backup.mmbak");
    createBackup(current);
    const target=path.join(app.getPath("userData"),"mms.db");
    closeDB(); extractVerifiedBackup(file,target);
    app.relaunch(); app.exit(0);
    return {success:true};
  });
}
