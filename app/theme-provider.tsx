"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export type DisplayTheme = "light" | "dark";

export const DISPLAY_THEME_STORAGE_KEY = "wwn-display-theme";

type ThemeContextValue = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const themeListeners = new Set<() => void>();

function readStoredTheme(): DisplayTheme {
  return typeof window !== "undefined"
    && window.localStorage.getItem(DISPLAY_THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: DisplayTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function notifyThemeListeners() {
  themeListeners.forEach(listener => listener());
}

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener);

  function syncStoredTheme(event: StorageEvent) {
    if (event.key === DISPLAY_THEME_STORAGE_KEY) {
      applyTheme(readStoredTheme());
      listener();
    }
  }

  window.addEventListener("storage", syncStoredTheme);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", syncStoredTheme);
  };
}

function updateStoredTheme(theme: DisplayTheme) {
  window.localStorage.setItem(DISPLAY_THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  notifyThemeListeners();
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    readStoredTheme,
    () => "light",
  );

  const setTheme = useCallback((nextTheme: DisplayTheme) => {
    updateStoredTheme(nextTheme);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useDisplayTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useDisplayTheme must be used inside ThemeProvider.");
  return value;
}

export function ThemeSelect({
  id,
  describedBy,
}: {
  id: string;
  describedBy?: string;
}) {
  const { theme, setTheme } = useDisplayTheme();

  return (
    <select
      id={id}
      value={theme}
      onChange={event => setTheme(event.target.value as DisplayTheme)}
      aria-describedby={describedBy}
    >
      <option value="light">Light mode</option>
      <option value="dark">Dark mode</option>
    </select>
  );
}
