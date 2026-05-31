"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("register.passwordMismatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("register.passwordTooShort"));
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("register.failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold mb-1">
          {t("register.title")}
        </h1>
        <p className="text-muted-foreground text-lg">
          {t("register.welcome")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="form-group">
          <label htmlFor="email">{t("register.email")}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ihre@email.de"
            required
            autoComplete="email"
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">{t("register.password")}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mindestens 8 Zeichen"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm-password">
            {t("register.confirmPassword")}
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Passwort wiederholen"
            required
            autoComplete="new-password"
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary w-full text-xl py-4"
          disabled={loading}
        >
          <UserPlus size={22} />
          {loading ? t("register.submitting") : t("register.submit")}
        </button>
      </form>

      <div className="mt-6 text-center text-lg">
        <p>
          <Link
            href="/login"
            className="font-semibold no-underline hover:underline"
          >
            {t("register.hasAccount")}
          </Link>
        </p>
      </div>
    </div>
  );
}
