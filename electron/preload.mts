/*
 * Preload — runs in isolated context, exposes typed bridge via window.mms
 *
 * Each method is a thin wrapper around ipcRenderer.invoke.
 */
import { contextBridge, ipcRenderer } from "electron";

const api = {
  // ===== Auth =====
  auth: {
    login: (username: string, password: string) => ipcRenderer.invoke("auth:login", username, password),
    logout: () => ipcRenderer.invoke("auth:logout"),
    currentUser: () => ipcRenderer.invoke("auth:currentUser"),
    changePassword: (userId: number, newPassword: string) =>
      ipcRenderer.invoke("auth:changePassword", userId, newPassword),
  },
  // ===== Families =====
  families: {
    list: (filter?: any) => ipcRenderer.invoke("families:list", filter),
    get: (id: number) => ipcRenderer.invoke("families:get", id),
    create: (data: any) => ipcRenderer.invoke("families:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("families:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("families:remove", id),
  },
  // ===== Members =====
  members: {
    list: (filter?: any) => ipcRenderer.invoke("members:list", filter),
    get: (id: number) => ipcRenderer.invoke("members:get", id),
    create: (data: any) => ipcRenderer.invoke("members:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("members:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("members:remove", id),
    relationships: () => ipcRenderer.invoke("members:relationships"),
  },
  // ===== Subscriptions =====
  subscriptions: {
    list: (filter?: any) => ipcRenderer.invoke("subscriptions:list", filter),
    get: (id: number) => ipcRenderer.invoke("subscriptions:get", id),
    create: (data: any) => ipcRenderer.invoke("subscriptions:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("subscriptions:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("subscriptions:remove", id),
    markOverdue: () => ipcRenderer.invoke("subscriptions:markOverdue"),
    totalCollected: () => ipcRenderer.invoke("subscriptions:totalCollected"),
    totalPending: () => ipcRenderer.invoke("subscriptions:totalPending"),
    plans: () => ipcRenderer.invoke("subscriptions:plans"),
  },
  // ===== Donations =====
  donations: {
    list: (filter?: any) => ipcRenderer.invoke("donations:list", filter),
    get: (id: number) => ipcRenderer.invoke("donations:get", id),
    create: (data: any) => ipcRenderer.invoke("donations:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("donations:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("donations:remove", id),
    categories: () => ipcRenderer.invoke("donations:categories"),
    totalThisMonth: () => ipcRenderer.invoke("donations:totalThisMonth"),
  },
  // ===== Accounting =====
  accounting: {
    list: (filter?: any) => ipcRenderer.invoke("accounting:list", filter),
    get: (id: number) => ipcRenderer.invoke("accounting:get", id),
    create: (data: any) => ipcRenderer.invoke("accounting:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("accounting:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("accounting:remove", id),
    totalIncome: () => ipcRenderer.invoke("accounting:totalIncome"),
    totalExpense: () => ipcRenderer.invoke("accounting:totalExpense"),
    balance: () => ipcRenderer.invoke("accounting:balance"),
  },
  // ===== Marriages =====
  marriages: {
    list: (filter?: any) => ipcRenderer.invoke("marriages:list", filter),
    get: (id: number) => ipcRenderer.invoke("marriages:get", id),
    create: (data: any) => ipcRenderer.invoke("marriages:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("marriages:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("marriages:remove", id),
  },
  // ===== Deaths =====
  deaths: {
    list: (filter?: any) => ipcRenderer.invoke("deaths:list", filter),
    get: (id: number) => ipcRenderer.invoke("deaths:get", id),
    create: (data: any) => ipcRenderer.invoke("deaths:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("deaths:update", id, data),
    remove: (id: number) => ipcRenderer.invoke("deaths:remove", id),
  },
  // ===== Welfare =====
  welfare: {
    list: (filter?: any) => ipcRenderer.invoke("welfare:list", filter),
    get: (id: number) => ipcRenderer.invoke("welfare:get", id),
    create: (data: any) => ipcRenderer.invoke("welfare:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("welfare:update", id, data),
    approve: (id: number, amount: number, remarks: string) => ipcRenderer.invoke("welfare:approve", id, amount, remarks),
    reject: (id: number, reason: string) => ipcRenderer.invoke("welfare:reject", id, reason),
    disburse: (id: number) => ipcRenderer.invoke("welfare:disburse", id),
    remove: (id: number) => ipcRenderer.invoke("welfare:remove", id),
    categories: () => ipcRenderer.invoke("welfare:categories"),
  },
  // ===== Certificates =====
  certificates: {
    list: (filter?: any) => ipcRenderer.invoke("certificates:list", filter),
    issueMembership: (code: string) => ipcRenderer.invoke("certificates:issueMembership", code),
    issueResidence: (familyNum: string, issuedTo: string) => ipcRenderer.invoke("certificates:issueResidence", familyNum, issuedTo),
    issueMarriage: (marriageNum: string) => ipcRenderer.invoke("certificates:issueMarriage", marriageNum),
    issueDeath: (deathNum: string) => ipcRenderer.invoke("certificates:issueDeath", deathNum),
    remove: (id: number) => ipcRenderer.invoke("certificates:remove", id),
    generatePdf: (id: number) => ipcRenderer.invoke("certificates:generatePdf", id),
  },
  // ===== PDF generation =====
  pdf: {
    generate: (html: string, defaultName: string) => ipcRenderer.invoke("pdf:generate", html, defaultName),
  },
  // ===== Users =====
  users: {
    list: () => ipcRenderer.invoke("users:list"),
    create: (data: any) => ipcRenderer.invoke("users:create", data),
    update: (id: number, data: any) => ipcRenderer.invoke("users:update", id, data),
    toggleLock: (id: number, locked: boolean) => ipcRenderer.invoke("users:toggleLock", id, locked),
    resetPassword: (id: number, newPwd: string) => ipcRenderer.invoke("users:resetPassword", id, newPwd),
    remove: (id: number) => ipcRenderer.invoke("users:remove", id),
  },
  // ===== Audit =====
  audit: {
    list: (filter?: any) => ipcRenderer.invoke("audit:list", filter),
  },
  // ===== Settings =====
  settings: {
    load: () => ipcRenderer.invoke("settings:load"),
    save: (data: any) => ipcRenderer.invoke("settings:save", data),
  },
  // ===== Dashboard =====
  dashboard: {
    summary: () => ipcRenderer.invoke("dashboard:summary"),
    incomeThisMonth: () => ipcRenderer.invoke("dashboard:incomeThisMonth"),
    expenseThisMonth: () => ipcRenderer.invoke("dashboard:expenseThisMonth"),
    balance: () => ipcRenderer.invoke("dashboard:balance"),
    monthlyCollections: (months?: number) => ipcRenderer.invoke("dashboard:monthlyCollections", months),
    monthlyDonations: (months?: number) => ipcRenderer.invoke("dashboard:monthlyDonations", months),
    incomeVsExpense: (months?: number) => ipcRenderer.invoke("dashboard:incomeVsExpense", months),
    recentActivity: (limit?: number) => ipcRenderer.invoke("dashboard:recentActivity", limit),
  },
  // ===== Backup =====
  backup: {
    create: () => ipcRenderer.invoke("backup:create"),
    list: () => ipcRenderer.invoke("backup:list"),
  },

  // ===== File save dialog (for exports) =====
  dialog: {
    showSave: (defaultName: string, filters: any[]) =>
      ipcRenderer.invoke("dialog:showSave", defaultName, filters),
  },
};

contextBridge.exposeInMainWorld("mms", api);

export type MmsApi = typeof api;
