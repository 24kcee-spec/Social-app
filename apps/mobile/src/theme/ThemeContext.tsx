import AsyncStorage from "@react-native-async-storage/async-storage";
import { dark, elevation, light, radius, space, touch, type, type ColorTokens } from "@sp/design-tokens";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export type ThemePreference = "system" | "light" | "dark";
export type ThemeMode = "light" | "dark";

export interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colors: ColorTokens;
  radius: typeof radius;
  space: typeof space;
  touch: typeof touch;
  type: typeof type;
  shadow: { 1: typeof elevation[1]["rn"]; 2: typeof elevation[2]["rn"] };
}

const STORAGE_KEY = "@sp_theme_preference";

const defaultThemeContext: ThemeContextValue = {
  theme: "light",
  isDark: false,
  preference: "system",
  setPreference: () => undefined,
  colors: light,
  radius,
  space,
  touch,
  type,
  shadow: { 1: elevation[1].rn, 2: elevation[2].rn },
};

const ThemeContext = createContext<ThemeContextValue>(defaultThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && saved && (saved === "system" || saved === "light" || saved === "dark")) {
          setPreferenceState(saved);
        }
      } catch {
        // Fallback silently to system
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  };

  const activeMode: ThemeMode = useMemo(() => {
    if (preference === "light") return "light";
    if (preference === "dark") return "dark";
    return systemScheme === "dark" ? "dark" : "light";
  }, [preference, systemScheme]);

  const value: ThemeContextValue = useMemo(() => {
    const activeColors = activeMode === "dark" ? dark : light;
    return {
      theme: activeMode,
      isDark: activeMode === "dark",
      preference,
      setPreference,
      colors: activeColors,
      radius,
      space,
      touch,
      type,
      shadow: { 1: elevation[1].rn, 2: elevation[2].rn },
    };
  }, [activeMode, preference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
