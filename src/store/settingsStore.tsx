import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { AppConfig } from "../types";

const THEME_LS_KEY = "super-k8s:theme";

function readSavedTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_LS_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const DEFAULT_CONFIG: AppConfig = {
  theme: readSavedTheme(),
  language: "zh",
  log_tail_lines_default: 500,
  check_updates_on_startup: true,
  allow_multiple_instances: false,
};

interface SettingsStoreValue {
  config: AppConfig;
  loading: boolean;
  save: (patch: Partial<AppConfig>) => Promise<void>;
}

const SettingsStoreContext = createContext<SettingsStoreValue | null>(null);

export function SettingsStoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await api.getAppConfig();
        try { localStorage.setItem(THEME_LS_KEY, cfg.theme); } catch { /* ignore */ }
        setConfig(cfg);
      } catch {
        // fall back to default
      }
    })();
  }, []);

  const save = useCallback(async (patch: Partial<AppConfig>) => {
    const next = { ...config, ...patch };
    setLoading(true);
    try {
      await api.saveAppConfig(next);
      if (patch.theme) {
        try { localStorage.setItem(THEME_LS_KEY, patch.theme); } catch { /* ignore */ }
      }
      setConfig(next);
    } finally {
      setLoading(false);
    }
  }, [config]);

  return (
    <SettingsStoreContext.Provider value={{ config, loading, save }}>
      {children}
    </SettingsStoreContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsStoreContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsStoreProvider");
  return ctx;
}
