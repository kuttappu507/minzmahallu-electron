import { create } from "zustand";

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  mustChangePwd: boolean;
  initials: string;
}

interface AuthState {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
}

let cachedSetupRequired: boolean | null = null;
let setupStatusPromise: Promise<boolean> | null = null;

export function getCachedSetupStatus(): boolean | null {
  return cachedSetupRequired;
}

export function preloadSetupStatus(timeoutMs = 3_000): Promise<boolean> {
  if (cachedSetupRequired !== null) return Promise.resolve(cachedSetupRequired);
  if (!setupStatusPromise) {
    const work = (async () => {
      try {
        const r = await (window as any).mms?.auth?.setupStatus?.();
        cachedSetupRequired = !!r?.required;
      } catch {
        cachedSetupRequired = false;
      }
      return cachedSetupRequired;
    })();
    setupStatusPromise = Promise.race([
      work,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(cachedSetupRequired ?? false), timeoutMs)),
    ]);
  }
  return setupStatusPromise;
}

export function clearCachedSetupStatus(): void {
  cachedSetupRequired = false;
  setupStatusPromise = Promise.resolve(false);
}

// NO persist — user must log in every time the app starts (security requirement).
// The user state is in-memory only, cleared on app restart.
export const useAuth = create<AuthState>()((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  logout: async () => {
    try {
      await window.mms.auth.logout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
    set({ user: null });
  },
}));
