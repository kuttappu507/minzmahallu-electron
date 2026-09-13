/*
 * Slide-over menu state (phones).
 *
 * The desktop build had a permanently visible 248px sidebar. On a phone that
 * column would eat the screen, so it becomes a drawer: this store is the only
 * piece of shared state — the topbar toggles it, the shell animates it, and
 * navigating (or tapping the backdrop) closes it.
 */
import { create } from "zustand";

interface MobileNavState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useMobileNav = create<MobileNavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
