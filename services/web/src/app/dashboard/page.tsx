"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Link as LinkIcon,
  SearchX,
} from "lucide-react";
import { api, type SearchProfile, type TelegramLinkResponse } from "@/lib/api";

export default function DashboardPage() {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [telegram, setTelegram] = useState<TelegramLinkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      const [p, t] = await Promise.all([
        api.getProfiles(),
        api.getTelegramLink().catch(() => null),
      ]);
      setProfiles(p);
      setTelegram(t);
    } catch {
      setError("Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleProfile = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await api.updateProfile(id, { name: "", city: "" } as never);
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: newStatus as "active" | "suspended" }
            : p,
        ),
      );
    } catch {
      setError("Status konnte nicht geändert werden.");
    }
  };

  const deleteProfile = async (id: string) => {
    if (!window.confirm("Suchprofil wirklich löschen?")) return;
    try {
      await api.deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Profil konnte nicht gelöscht werden.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xl text-muted-foreground">Wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">Mein Dashboard</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Verwalten Sie Ihre Suchprofile und Benachrichtigungen
        </p>
      </div>

      {error && (
        <div className="badge badge-danger text-base p-3">{error}</div>
      )}

      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                telegram?.connected ? "bg-success" : "bg-muted-foreground"
              }`}
            />
            <span className="text-lg font-semibold">
              Telegram:{" "}
              {telegram?.connected ? (
                <span className="text-success">Verbunden</span>
              ) : (
                <span className="text-muted-foreground">
                  Nicht verbunden
                </span>
              )}
            </span>
          </div>
          {!telegram?.connected && telegram?.link && (
            <a
              href={telegram.link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary no-underline"
            >
              <LinkIcon size={20} />
              Mit Telegram verbinden
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Suchprofile</h2>
        <Link href="/dashboard/profiles/new" className="btn btn-secondary no-underline text-lg">
          <Plus size={22} />
          Neues Suchprofil
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="card text-center py-12">
          <SearchX size={64} className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-bold mb-2">
            Noch keine Suchprofile
          </h3>
          <p className="text-lg text-muted-foreground mb-6">
            Erstellen Sie Ihr erstes Suchprofil und wir suchen passende
            Wohnungen für Sie.
          </p>
          <Link
            href="/dashboard/profiles/new"
            className="btn btn-primary no-underline text-xl"
          >
            <Plus size={22} />
            Erstes Suchprofil erstellen
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="card">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold">{profile.name}</h3>
                    <span
                      className={`badge ${
                        profile.status === "active"
                          ? "badge-success"
                          : "badge-warning"
                      }`}
                    >
                      {profile.status === "active" ? "Aktiv" : "Pausiert"}
                    </span>
                  </div>
                  <p className="text-lg text-muted-foreground">
                    {profile.city}
                    {profile.price_min != null &&
                      profile.price_max != null &&
                      ` · ${profile.price_min}–${profile.price_max} €`}
                    {profile.area_min != null &&
                      profile.area_max != null &&
                      ` · ${profile.area_min}–${profile.area_max} m²`}
                  </p>
                  {(profile.balcony ||
                    profile.elevator ||
                    profile.parking ||
                    profile.pets) && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {profile.balcony && (
                        <span className="badge badge-success">Balkon</span>
                      )}
                      {profile.elevator && (
                        <span className="badge badge-success">Aufzug</span>
                      )}
                      {profile.parking && (
                        <span className="badge badge-success">Parkplatz</span>
                      )}
                      {profile.pets && (
                        <span className="badge badge-success">
                          Haustiere
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => toggleProfile(profile.id, profile.status)}
                    className="btn btn-outline p-3"
                    title={
                      profile.status === "active"
                        ? "Pausieren"
                        : "Aktivieren"
                    }
                  >
                    {profile.status === "active" ? (
                      <ToggleRight size={22} />
                    ) : (
                      <ToggleLeft size={22} />
                    )}
                  </button>
                  <Link
                    href={`/dashboard/profiles/${profile.id}/matches`}
                    className="btn btn-outline p-3 no-underline"
                    title="Treffer ansehen"
                  >
                    <Eye size={22} />
                  </Link>
                  <Link
                    href={`/dashboard/profiles/${profile.id}/edit`}
                    className="btn btn-outline p-3 no-underline"
                    title="Bearbeiten"
                  >
                    <Pencil size={22} />
                  </Link>
                  <button
                    onClick={() => deleteProfile(profile.id)}
                    className="btn btn-danger p-3"
                    title="Löschen"
                  >
                    <Trash2 size={22} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
