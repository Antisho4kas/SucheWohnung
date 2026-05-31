"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      await register(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Registrierung fehlgeschlagen";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-extrabold mb-1">Registrieren</h1>
        <p className="text-muted-foreground text-lg">
          Erstellen Sie Ihr Konto bei SucheWohnung
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
            placeholder="Mindestens 8 Zeichen"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm-password">Passwort bestätigen</label>
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
          {loading ? "Konto wird erstellt..." : "Konto erstellen"}
        </button>
      </form>

      <div className="mt-6 text-center text-lg">
        <p>
          <Link
            href="/login"
            className="font-semibold no-underline hover:underline"
          >
            Bereits registriert? Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
