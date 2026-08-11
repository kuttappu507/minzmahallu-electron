import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  apply: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      setTheme: (t) => {
        set({ theme: t });
        get().apply();
      },
      toggle: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        get().apply();
      },
      apply: () => {
        const t = get().theme;
        const root = document.documentElement;
        // Default is dark (no class). Light adds .light class.
        if (t === "light") {
          root.classList.add("light");
          root.classList.remove("dark");
        } else {
          root.classList.remove("light");
          root.classList.add("dark");
        }
        root.style.colorScheme = t;
      },
    }),
    {
      name: "mms-theme",
      onRehydrateStorage: () => (state) => {
        if (state) state.apply();
      },
    }
  )
);
