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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await res.json();

  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? "Request failed";
    throw new Error(msg);
  }

  return body;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("auth_token");
    if (stored) {
      setToken(stored);
      apiFetch("/me")
        .then((data: unknown) => {
          const d = data as { email?: string; id?: string; role?: string };
          if (d.email) setUser({ id: d.id ?? "", email: d.email, role: d.role ?? "user" });
          else throw new Error("no user");
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = (await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })) as { access_token?: string; refresh_token?: string };

      const accessToken = res.access_token ?? "";
      if (!accessToken) throw new Error("No access token");

      localStorage.setItem("auth_token", accessToken);
      setToken(accessToken);

      const me = (await apiFetch("/me")) as { id?: string; email?: string; role?: string };
      setUser({ id: me.id ?? "", email: me.email ?? "", role: me.role ?? "user" });
      router.push("/dashboard");
    },
    [router],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = (await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      })) as { id?: string };

      if (!res.id) throw new Error("Registration failed");

      // Auto-login after registration
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

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
