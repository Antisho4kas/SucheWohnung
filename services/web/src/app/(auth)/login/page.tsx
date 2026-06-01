"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { LogIn, Mail, Lock, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("login.failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 bg-gradient-to-br from-slate-50 via-white to-blue-50 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950">
      <div className="w-full max-w-md animate-fade-in">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Zurück zur Startseite
        </Link>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <LogIn size={28} className="text-primary" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-1">
              {t("login.title")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("login.welcome")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                {t("login.email")}
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ihre@email.de"
                  required
                  autoComplete="email"
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                {t("login.password")}
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pl-10"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-base"
              disabled={loading}
            >
              <LogIn size={20} />
              {loading ? t("login.submitting") : t("login.submit")}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-center">
            <p className="text-sm">
              <Link href="/register" className="font-semibold text-primary hover:underline">
                {t("login.noAccount")}
              </Link>
            </p>
            <p>
              <Link href="/forgot-password" className="text-sm text-slate-400 dark:text-slate-500 hover:text-primary transition-colors">
                {t("login.forgotPassword")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
