/* ============================================================================
 * The IPC registry — Electron's ipcMain, minus the process boundary.
 *
 * On the desktop the renderer called `window.mms.<module>.<method>()`, which
 * went over IPC to a handler registered in the main process. On Android the UI
 * and the service layer share one JavaScript context, but the SECURITY MODEL
 * must not change: every call still goes through a named, auth-checked handler
 * (see security-ipc.ts) instead of touching the database directly.
 *
 * So the handlers stay exactly as they were — only the transport is gone:
 * `ipcMain.handle(channel, fn)` becomes `register(channel, fn)`, and the bridge
 * in ./mms.ts invites them by channel name. Handler order still matters: the
 * secured handlers are registered last and overwrite the permissive ones, which
 * is precisely how the desktop build locked the channels down.
 * ========================================================================== */

export type IpcHandler = (...args: any[]) => any;
export type IpcRegistrar = (name: string, handler: IpcHandler) => void;

const handlers = new Map<string, IpcHandler>();

export const register: IpcRegistrar = (name, handler) => {
  handlers.set(name, handler);
};

export function hasHandler(name: string): boolean {
  return handlers.has(name);
}

export function listHandlers(): string[] {
  return [...handlers.keys()].sort();
}

/** Call a registered handler (the bridge's `ipcRenderer.invoke`). */
export async function invoke<T = any>(name: string, ...args: any[]): Promise<T> {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Unknown API method: ${name}`);
  return (await handler(...args)) as T;
}
