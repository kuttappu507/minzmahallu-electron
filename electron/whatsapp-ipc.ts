import { app, ipcMain } from "electron";
import { whatsapp } from "./services/whatsapp.service.js";
import { startWaha, stopWaha } from "./services/waha-runtime.service.js";

let registered = false;
function requireAuth(){const actor=(globalThis as any).__mmsGetActor?.();if(!actor)throw new Error("Authentication required");return actor;}
export function registerWhatsAppIpc(){
  if(registered)return;registered=true;whatsapp.init();
  ipcMain.handle("whatsapp:status",()=>{requireAuth();return whatsapp.status();});
  ipcMain.handle("whatsapp:connect",()=>{requireAuth();return whatsapp.connect();});
  ipcMain.handle("whatsapp:qr",()=>{requireAuth();return whatsapp.qr();});
  ipcMain.handle("whatsapp:disconnect",()=>{requireAuth();return whatsapp.disconnect();});
  ipcMain.handle("whatsapp:checkNumber",(_e,phone:string)=>{requireAuth();return whatsapp.checkNumber(phone);});
  ipcMain.handle("whatsapp:setFamily",(_e,familyId:number,phone:string,enabled:boolean)=>{requireAuth();return whatsapp.setFamilyWhatsApp(familyId,phone,enabled);});
  ipcMain.handle("whatsapp:getFamily",(_e,familyId:number)=>{requireAuth();return whatsapp.familyWhatsApp(familyId);});
  ipcMain.handle("whatsapp:sendMessage",(_e,input)=>{requireAuth();return whatsapp.sendMessage(input);});
  ipcMain.handle("whatsapp:sendDonationReceipt",(_e,donationId:number)=>{requireAuth();return whatsapp.sendDonationReceipt(donationId);});
  ipcMain.handle("whatsapp:createSubscriptionCampaign",()=>{requireAuth();return whatsapp.createSubscriptionCampaign();});
  ipcMain.handle("whatsapp:createAnnouncementCampaign",(_e,text:string)=>{requireAuth();return whatsapp.createAnnouncementCampaign(text);});
  ipcMain.handle("whatsapp:runCampaign",(_e,id:number)=>{requireAuth();return whatsapp.runCampaign(id);});
  ipcMain.handle("whatsapp:getCampaign",(_e,id:number)=>{requireAuth();return whatsapp.campaign(id);});
  ipcMain.handle("whatsapp:listCampaigns",(_e,limit?:number)=>{requireAuth();return whatsapp.campaigns(limit||30);});
  ipcMain.handle("whatsapp:listHistory",(_e,limit?:number)=>{requireAuth();return whatsapp.history(limit||100);});
  ipcMain.handle("whatsapp:retryFailed",(_e,id:number)=>{requireAuth();return whatsapp.retryFailed(id);});
  ipcMain.handle("whatsapp:runtimeState",()=>{requireAuth();return whatsapp.runtimeState();});
  void startWaha().catch(err=>console.warn("[WhatsApp] local service not started:",err?.message||err));
  app.on("before-quit",()=>{void stopWaha();});
}
app.whenReady().then(registerWhatsAppIpc);
