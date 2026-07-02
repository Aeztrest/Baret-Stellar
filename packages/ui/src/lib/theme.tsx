/**
 * Baret theme controller — one class-based system for every surface
 * (web, extension popup/options, and the content-script shadow root).
 *
 * The house pattern: a single button that cycles system → light → dark.
 * `mode` is the user's choice; `resolved` is what's actually applied. We
 * toggle the `.dark` class on `root` (defaults to <html>; the content script
 * passes its shadow wrapper so tokens resolve inside the shadow tree).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  /** Advance system → light → dark → system. */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const CYCLE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

function systemPref(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStored(key: string): ThemeMode | null {
  try {
    const v = localStorage.getItem(key);
    return v === "light" || v === "dark" || v === "system" ? v : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({
  children,
  storageKey = "baret-theme",
  defaultMode = "system",
  root,
}: {
  children: ReactNode;
  storageKey?: string;
  defaultMode?: ThemeMode;
  /** Element to toggle `.dark` on. Defaults to <html>. */
  root?: HTMLElement | null;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored(storageKey) ?? defaultMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(systemPref);

  // Track OS preference while in system mode.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = mode === "system" ? systemTheme : mode;

  // Apply the class to the chosen root.
  useEffect(() => {
    const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
    if (!el) return;
    el.classList.toggle("dark", resolved === "dark");
    el.style.colorScheme = resolved;
  }, [resolved, root]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* storage may be unavailable */
      }
    },
    [storageKey],
  );

  const cycle = useCallback(() => setMode(CYCLE[mode]), [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}

/**
 * Apply the persisted theme class synchronously, before React mounts, to
 * avoid a light→dark flash. Call once at the top of an entry file.
 */
export function applyStoredTheme(storageKey = "baret-theme", root?: HTMLElement) {
  const el = root ?? document.documentElement;
  const stored = readStored(storageKey) ?? "system";
  const resolved = stored === "system" ? systemPref() : stored;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}
