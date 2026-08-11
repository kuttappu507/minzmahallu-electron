import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  apply: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "light",
      setTheme: (t) => {
        set({ theme: t });
        get().apply();
      },
      toggle: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        get().apply();
      },
      apply: () => {
        const t = get().theme;
        const root = document.documentElement;
        if (t === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
        root.style.colorScheme = t;
      },
    }),
    {
      name: "mms-theme",
      onRehydrateStorage: () => (state) => {
        // Apply theme as soon as persisted state is loaded
        if (state) state.apply();
      },
    }
  )
);
