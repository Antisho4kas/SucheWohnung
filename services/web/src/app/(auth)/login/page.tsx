"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
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
      const message =
        err instanceof Error ? err.message : "Anmeldung fehlgeschlagen";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold mb-1">Anmelden</h1>
        <p className="text-muted-foreground text-lg">
          Willkommen zurück bei SucheWohnung
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="form-group">
          <label htmlFor="email">E-Mail-Adresse</label>
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
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="btn btn-primary w-full text-xl py-4"
          disabled={loading}
        >
          <LogIn size={22} />
          {loading ? "Wird angemeldet..." : "Anmelden"}
        </button>
      </form>

      <div className="mt-6 text-center space-y-2 text-lg">
        <p>
          <Link
            href="/register"
            className="font-semibold no-underline hover:underline"
          >
            Noch kein Konto? Registrieren
          </Link>
        </p>
        <p>
          <Link
            href="/forgot-password"
            className="text-muted-foreground no-underline hover:underline"
          >
            Passwort vergessen?
          </Link>
        </p>
      </div>
    </div>
  );
}
