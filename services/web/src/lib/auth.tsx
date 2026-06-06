"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  api,
  clearAuthSession,
  getStoredAccessToken,
  setAuthFailureHandler,
  storeAuthSession,
  type RegisterResponse,
  type User,
} from "./api";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function toAuthUser(user: User): User {
  return {
    ...user,
    id: user.id ?? "",
    role: user.role ?? "user",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const clearSession = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      clearSession();
      router.push("/login");
    });

    return () => setAuthFailureHandler(null);
  }, [clearSession, router]);

  useEffect(() => {
    const stored = getStoredAccessToken();
    if (stored) {
      setToken(stored);
      api
        .getMe()
        .then((u) => setUser(toAuthUser(u)))
        .catch(() => {
          clearSession();
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password });

      const accessToken = res.access_token ?? "";
      if (!accessToken) throw new Error("No access token");

      storeAuthSession(res);
      setToken(accessToken);

      const u = res.user ?? (await api.getMe());
      setUser(toAuthUser(u));
      router.push("/dashboard");
    },
    [router],
  );

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.register({ email, password });

    if (!res.id) throw new Error("Registration failed");

    return res;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
    router.push("/");
  }, [clearSession, router]);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: !!token && !!user,
      login,
      register,
      logout,
    }),
    [user, token, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
