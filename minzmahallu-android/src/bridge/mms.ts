/* ============================================================================
 * window.mms — the API the UI has always talked to.
 *
 * Shape-for-shape identical to the desktop preload (electron/preload.mts), so
 * not one page, hook or component needed rewriting: the same
 * `window.mms.<module>.<method>(...)` calls, the same argument order, the same
 * return values. The only difference is what sits underneath — a registry of
 * auth-checked handlers in this same JavaScript context instead of IPC to a
 * Node main process.
 *
 * Deliberate additions for the mobile edition (all additive, nothing removed):
 *   · files.save / files.saveText — hand a generated file to the share sheet on
 *     Android instead of triggering a browser download;
 *   · backup.share / backup.delete — send a .mmbak to Drive/another phone, or
 *     remove it;
 *   · whatsapp.pendingRecipients — the campaign walk-through list.
 *
 * Features that only exist on a desktop (frameless-window controls, the GitHub
 * auto-updater, the NSIS uninstall gate) are present as safe no-ops so screens
 * that reference them keep working on a phone.
 * ========================================================================== */
import { invoke } from "./registry.js";

const call = invoke;

export const mmsApi = {
  auth: {
    login: (username: string, password: string) => call("auth:login", username, password),
    logout: async () => {
      const result = await call("auth:logout");
      try { await call("whatsapp:invalidateAuth"); } catch { /* not registered yet */ }
      return result;
    },
    currentUser: () => call("auth:currentUser"),
    changePassword: (id: number, password: string) => call("auth:changePassword", id, password),
    setupStatus: () => call("auth:setupStatus"),
    createInitialAdministrator: (username: string, name: string, password: string) => call("auth:createInitialAdministrator", username, name, password),
    verifyAdminPassword: (password: string, action?: string, detail?: string) => call("auth:verifyAdminPassword", password, action || "", detail || ""),
  },
  families: {
    list: (f?: any) => call("families:list", f),
    get: (id: number) => call("families:get", id),
    create: (d: any) => call("families:create", d),
    update: (id: number, d: any) => call("families:update", id, d),
    archive: (id: number, reason: string) => call("security:archiveFamily", id, reason),
    restore: (id: number, reason?: string) => call("security:restoreFamily", id, reason || ""),
    history: (id: number) => call("security:familyHistory", id),
    createFromMembers: (ids: number[], d: any, headId: number, reason: string) => call("security:createFamilyFromMembers", ids, d, headId, reason),
  },
  members: {
    list: (f?: any) => call("members:list", f),
    get: (id: number) => call("members:get", id),
    create: (d: any) => call("members:create", d),
    update: (id: number, d: any) => call("members:update", id, d),
    archive: (id: number, reason: string) => call("security:archiveMember", id, reason),
    restore: (id: number, reason?: string) => call("security:restoreMember", id, reason || ""),
    history: (id: number) => call("security:memberHistory", id),
    move: (ids: number[], familyId: number, reason: string) => call("security:moveMembers", ids, familyId, reason, "ExistingFamily"),
    moveHistory: (id: number) => call("security:memberMoveHistory", id),
    relationships: () => call("members:relationships"),
    relations: (id: number) => call("members:relations", id),
  },
  subscriptions: {
    list: (f?: any) => call("subscriptions:list", f),
    get: (id: number) => call("subscriptions:get", id),
    create: (d: any) => call("subscriptions:create", d),
    update: (id: number, d: any) => call("subscriptions:update", id, d),
    remove: (id: number) => call("subscriptions:remove", id),
    cancelPayment: (id: number, reason: string, password: string) => call("subscriptions:cancelPayment", id, reason, password),
    paymentsHistory: (familyId: number) => call("subscriptions:paymentsHistory", familyId),
    markOverdue: () => call("subscriptions:markOverdue"),
    totalCollected: () => call("subscriptions:totalCollected"),
    totalPending: () => call("subscriptions:totalPending"),
    plans: () => call("subscriptions:plans"),
    ensureCurrentMonth: () => call("subscriptions:ensureCurrentMonth"),
  },
  donations: {
    list: (f?: any) => call("donations:list", f),
    get: (id: number) => call("donations:get", id),
    create: (d: any) => call("donations:create", d),
    update: (id: number, d: any, password: string, reason: string) => call("donations:update", id, d, password || "", reason || ""),
    remove: (id: number) => call("donations:remove", id),
    categories: () => call("donations:categories"),
    categoriesAll: () => call("donations:categoriesAll"),
    createCategory: (name: string, description?: string) => call("donations:createCategory", name, description || ""),
    updateCategory: (id: number, name: string, description?: string) => call("donations:updateCategory", id, name, description || ""),
    setCategoryActive: (id: number, active: boolean) => call("donations:setCategoryActive", id, active),
    removeCategory: (id: number) => call("donations:removeCategory", id),
    memberBalance: (familyId: number, memberId?: number) => call("donations:memberBalance", familyId, memberId),
    totalThisMonth: () => call("donations:totalThisMonth"),
  },
  whatsapp: {
    status: () => call("whatsapp:status"),
    connect: () => call("whatsapp:connect"),
    qr: () => call("whatsapp:qr"),
    disconnect: () => call("whatsapp:disconnect"),
    unlink: () => call("whatsapp:unlink"),
    checkNumber: (phone: string) => call("whatsapp:checkNumber", phone),
    setFamily: (familyId: number, phone: string, enabled: boolean) => call("whatsapp:setFamily", familyId, phone, enabled),
    getFamily: (familyId: number) => call("whatsapp:getFamily", familyId),
    sendMessage: (input: any) => call("whatsapp:sendMessage", input),
    sendDonationReceipt: (donationId: number, adminPassword?: string) => call("whatsapp:sendDonationReceipt", donationId, adminPassword || undefined),
    sendSubscriptionReceipt: (subscriptionId: number, adminPassword?: string) => call("whatsapp:sendSubscriptionReceipt", subscriptionId, adminPassword || undefined),
    recipientStats: (type: "ANNOUNCEMENT" | "SUBSCRIPTION_REMINDER") => call("whatsapp:recipientStats", type),
    createSubscriptionCampaign: () => call("whatsapp:createSubscriptionCampaign"),
    createAnnouncementCampaign: (text: string) => call("whatsapp:createAnnouncementCampaign", text),
    runCampaign: (id: number) => call("whatsapp:runCampaign", id),
    getCampaign: (id: number) => call("whatsapp:getCampaign", id),
    listCampaigns: (limit?: number) => call("whatsapp:listCampaigns", limit || 30),
    listHistory: (limit?: number) => call("whatsapp:listHistory", limit || 100),
    pendingRecipients: (id: number) => call("whatsapp:pendingRecipients", id),
    retryFailed: (id: number) => call("whatsapp:retryFailed", id),
    runtimeState: () => call("whatsapp:runtimeState"),
  },
  accounting: {
    list: (f?: any) => call("accounting:list", f),
    get: (id: number) => call("accounting:get", id),
    create: (d: any) => call("accounting:create", d),
    update: (id: number, d: any, password: string, reason: string) => call("accounting:update", id, d, password || "", reason || ""),
    remove: (id: number) => call("accounting:remove", id),
    void: (id: number, reason: string, password: string) => call("accounting:void", id, reason, password || ""),
    receiptSequence: () => call("accounting:receiptSequence"),
    totalIncome: () => call("accounting:totalIncome"),
    totalExpense: () => call("accounting:totalExpense"),
    balance: () => call("accounting:balance"),
    unifiedList: (f?: any) => call("accounting:unifiedList", f),
    unifiedSummary: (f?: any) => call("accounting:unifiedSummary", f),
    detail: (source: string, id: number) => call("accounting:detail", source, id),
    exportPdf: (f?: any) => call("accounting:exportPdf", f),
    exportExcel: (f?: any) => call("accounting:exportExcel", f),
    exportAuditPack: (year: number) => call("accounting:exportAuditPack", year),
  },
  marriages: {
    list: (f?: any) => call("marriages:list", f),
    get: (id: number) => call("marriages:get", id),
    create: (d: any) => call("marriages:create", d),
    update: (id: number, d: any) => call("marriages:update", id, d),
    remove: (id: number) => call("marriages:remove", id),
    printRegister: () => call("marriages:registerPdf"),
  },
  deaths: {
    list: (f?: any) => call("deaths:list", f),
    get: (id: number) => call("deaths:get", id),
    create: (d: any) => call("deaths:create", d),
    update: (id: number, d: any) => call("deaths:update", id, d),
    remove: (id: number) => call("deaths:remove", id),
    printRegister: () => call("deaths:registerPdf"),
  },
  welfare: {
    list: (f?: any) => call("welfare:list", f),
    get: (id: number) => call("welfare:get", id),
    create: (d: any) => call("welfare:create", d),
    update: (id: number, d: any) => call("welfare:update", id, d),
    approve: (id: number, amount: number, remarks: string, minutesDate?: string) => call("welfare:approve", id, amount, remarks, minutesDate || ""),
    reject: (id: number, reason: string) => call("welfare:reject", id, reason),
    disburse: (id: number, reason?: string, password?: string) => call("welfare:disburse", id, reason || "", password || ""),
    remove: (id: number) => call("welfare:remove", id),
    categories: () => call("welfare:categories"),
  },
  certificates: {
    list: (f?: any) => call("certificates:list", f),
    issueMembership: (code: string) => call("certificates:issueMembership", code),
    issueResidence: (familyNumber: string, issuedTo: string) => call("certificates:issueResidence", familyNumber, issuedTo),
    issueMarriage: (marriageNumber: string) => call("certificates:issueMarriage", marriageNumber),
    issueMarriageNoc: (marriageNumber: string) => call("certificates:issueMarriageNoc", marriageNumber),
    issueDeath: (deathNumber: string) => call("certificates:issueDeath", deathNumber),
    remove: (id: number) => call("certificates:remove", id),
    generatePdf: (id: number) => call("certificates:generatePdf", id),
    previewHtml: (id: number) => call("certificates:previewHtml", id),
    verify: (code: string) => call("certificates:verify", code),
    verifyQr: (payload: string) => call("certificates:verifyQr", payload),
  },
  pdf: {
    generate: (html: string, name: string) => call("pdf:generate", html, name),
    getAnekFontCss: () => call("pdf:getAnekFontCss"),
  },
  receipts: {
    getDonationPdf: (id: number) => call("receipts:getDonationPdf", id),
    getSubscriptionPdf: (subscriptionId: number) => call("receipts:getSubscriptionPdf", subscriptionId),
    saveDonationPdf: (id: number) => call("receipts:saveDonationPdf", id),
    saveSubscriptionPdf: (subscriptionId: number) => call("receipts:saveSubscriptionPdf", subscriptionId),
    saveDonationBatchPdf: (ids: number[]) => call("receipts:saveDonationBatchPdf", ids),
    saveSubscriptionBatchPdf: (subscriptionIds: number[]) => call("receipts:saveSubscriptionBatchPdf", subscriptionIds),
  },
  users: {
    list: () => call("users:list"),
    create: (d: any) => call("users:create", d),
    update: (id: number, d: any) => call("users:update", id, d),
    toggleLock: (id: number, locked: boolean) => call("users:toggleLock", id, locked),
    resetPassword: (id: number, password: string) => call("users:resetPassword", id, password),
    remove: (id: number) => call("users:remove", id),
  },
  staff: {
    list: (f?: any) => call("staff:list", f),
    get: (id: number) => call("staff:get", id),
    roles: () => call("staff:roles"),
    create: (d: any) => call("staff:create", d),
    update: (id: number, d: any) => call("staff:update", id, d),
    archive: (id: number, reason: string) => call("staff:archive", id, reason),
    setStatus: (id: number, status: "Resigned" | "Expelled", effectiveDate: string, reason: string, adminPassword: string) => call("staff:setStatus", id, status, effectiveDate, reason, adminPassword),
    restore: (id: number) => call("staff:restore", id),
    history: (id: number) => call("staff:history", id),
    listPayments: (f?: any) => call("staff:listPayments", f),
    paySalary: (d: any) => call("staff:paySalary", d),
    cancelPayment: (id: number, reason?: string, adminPassword?: string) => call("staff:cancelPayment", id, reason || "", adminPassword || ""),
    salarySummary: (year?: number) => call("staff:salarySummary", year),
  },
  committee: {
    list: (f?: any) => call("committee:list", f),
    get: (id: number) => call("committee:get", id),
    positions: () => call("committee:positions"),
    types: () => call("committee:types"),
    summary: () => call("committee:summary"),
    create: (d: any) => call("committee:create", d),
    update: (id: number, d: any) => call("committee:update", id, d),
    archive: (id: number, reason: string) => call("committee:archive", id, reason),
    restore: (id: number) => call("committee:restore", id),
    history: (id: number) => call("committee:history", id),
  },
  audit: {
    list: (f?: any) => call("audit:list", f),
    verify: () => call("audit:verify"),
  },
  settings: {
    load: () => call("settings:load"),
    save: (d: any) => call("settings:save", d),
  },
  app: {
    info: () => call("app:info"),
    /** Mobile additions: keep the database on disk safe when the app is
     *  backgrounded (the WebView can be killed at any moment). */
    flush: () => call("app:flush"),
  },
  dashboard: {
    summary: () => call("dashboard:summary"),
    incomeThisMonth: () => call("dashboard:incomeThisMonth"),
    expenseThisMonth: () => call("dashboard:expenseThisMonth"),
    balance: () => call("dashboard:balance"),
    monthlyCollections: (months?: number) => call("dashboard:monthlyCollections", months),
    monthlyDonations: (months?: number) => call("dashboard:monthlyDonations", months),
    incomeVsExpense: (months?: number) => call("dashboard:incomeVsExpense", months),
    recentActivity: (limit?: number) => call("dashboard:recentActivity", limit),
    alerts: () => call("dashboard:alerts"),
    todayAtGlance: () => call("dashboard:todayAtGlance"),
  },
  backup: {
    create: (name?: string) => call("backup:create", name),
    list: () => call("backup:list"),
    verify: (file: string) => call("backup:verify", file),
    restore: (file: string) => call("backup:restore", file),
    chooseMirrorDir: () => call("backup:chooseMirrorDir"),
    share: (file: string) => call("backup:share", file),
    delete: (file: string) => call("backup:delete", file),
  },
  tokens: {
    listEvents: () => call("tokens:listEvents"),
    getEvent: (id: number) => call("tokens:getEvent", id),
    createEvent: (d: any) => call("tokens:createEvent", d),
    updateEvent: (id: number, d: any) => call("tokens:updateEvent", id, d),
    removeEvent: (id: number, reason: string) => call("tokens:removeEvent", id, reason),
    list: (f?: any) => call("tokens:list", f),
    checkExisting: (id: number) => call("tokens:checkExisting", id),
    generate: (id: number, familyIds: number[]) => call("tokens:generate", id, familyIds),
    collect: (id: number) => call("tokens:collect", id),
    cancel: (id: number, reason: string) => call("tokens:cancel", id, reason),
    replace: (id: number, reason: string) => call("tokens:replace", id, reason),
    remove: (id: number, reason: string) => call("tokens:remove", id, reason),
    stats: (id: number) => call("tokens:stats", id),
    listForPdf: (id: number) => call("tokens:listForPdf", id),
    generateTokenPdf: (id: number) => call("tokens:generateTokenPdf", id),
    generateCollectionSheet: (id: number) => call("tokens:generateCollectionSheet", id),
  },
  /** Files leaving the app: share sheet on Android, download in a browser. */
  files: {
    save: (name: string, mime: string, base64: string) => call("files:save", name, mime, base64),
    saveText: (name: string, mime: string, text: string) => call("files:saveText", name, mime, text),
  },
  /** Desktop-only concepts — present as safe no-ops so shared screens work. */
  win: {
    minimize: () => { try { call("app:minimize"); } catch { /* browser */ } },
    maximize: () => {},
    close: () => { try { call("app:minimize"); } catch { /* browser */ } },
    confirmClose: () => {},
    onAskClose: (_cb: () => void) => () => {},
  },
  updates: {
    status: () => Promise.resolve({ updateAvailable: false, currentVersion: "2.0.0", latestVersion: "", url: "", downloadUrl: null }),
    checkNow: () => Promise.resolve({ ok: true, updateAvailable: false, currentVersion: "2.0.0", latestVersion: "", url: "", downloadUrl: null, note: "Android builds update from the Play Store or a new APK." }),
    openReleasePage: () => Promise.resolve({ success: true }),
    openDownload: () => Promise.resolve({ success: true }),
  },
  events: {
    onDownloadFailed: (_cb: (name: string) => void) => () => {},
    onUpdateAvailable: (_cb: (info: any) => void) => () => {},
  },
};

export type MmsApi = typeof mmsApi;

/** Install the bridge on `window` (idempotent). */
export function installMmsBridge(): void {
  if (typeof window === "undefined") return;
  (window as any).mms = mmsApi;
  (window as any).mmsPlatform = "android";
}
