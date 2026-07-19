import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AdminRole } from "@siemprebarato/shared";
import { apiFetch } from "../lib/api";

type SessionUser = { id: string; email: string; displayName: string; role: AdminRole };
type AuthConfig = { googleConfigured: boolean; developmentLoginEnabled: boolean };
type AuthContextValue = {
  user: SessionUser | null;
  config: AuthConfig | null;
  loading: boolean;
  refresh: () => Promise<void>;
  developmentLogin: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const configResponse = await apiFetch<{ googleConfigured: boolean; developmentLoginEnabled: boolean }>("/api/auth/config");
      setAuthConfig(configResponse);
      const session = await apiFetch<{ user: SessionUser }>("/api/auth/session");
      setUser(session.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void refresh(), [refresh]);

  const developmentLogin = useCallback(async () => {
    await apiFetch("/api/auth/dev-login", { method: "POST", body: JSON.stringify({}) });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, config: authConfig, loading, refresh, developmentLogin, logout }),
    [user, authConfig, loading, refresh, developmentLogin, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
