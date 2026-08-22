"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DisplayTheme = "light" | "dark";

export const DISPLAY_THEME_STORAGE_KEY = "wwn-display-theme";

type ThemeContextValue = {
  theme: DisplayTheme;
  setTheme: (theme: DisplayTheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): DisplayTheme {
  return localStorage.getItem(DISPLAY_THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme: DisplayTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<DisplayTheme>("light");

  useEffect(() => {
    const restoredTheme = readStoredTheme();
    applyTheme(restoredTheme);
    setThemeState(restoredTheme);
  }, []);

  const setTheme = useCallback((nextTheme: DisplayTheme) => {
    localStorage.setItem(DISPLAY_THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    setThemeState(nextTheme);
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
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );
}
