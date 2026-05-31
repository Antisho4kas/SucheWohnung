"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight, LinkIcon, SearchX, Copy, Check } from "lucide-react";
import { api, type SearchProfile } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function DashboardPage() {
  const { t } = useLocale();
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [tgConnected, setTgConnected] = useState(false);
  const [tgLink, setTgLink] = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const p = await api.getProfiles();
      setProfiles(p);
    } catch {
      setError(t("dashboard.profiles.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const checkTelegram = useCallback(async () => {
    try {
      const tg = await api.getTelegramLink();
      setTgConnected(tg.connected ?? false);
      if (!tg.connected && tg.link) setTgLink(tg.link);
    } catch {
      setTgConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    checkTelegram();
  }, [fetchData, checkTelegram]);

  const handleConnectTelegram = async () => {
    setTgLoading(true);
    try {
      const tg = await api.getTelegramLink();
      setTgLink(tg.link ?? "");
      setTgConnected(tg.connected ?? false);
    } catch {
      setError(t("common.error"));
    } finally {
      setTgLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(tgLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const deleteProfile = async (id: string) => {
    if (!window.confirm(t("dashboard.profiles.confirmDelete"))) return;
    try {
      await api.deleteProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError(t("dashboard.profiles.deleteError"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xl text-muted-foreground">{t("dashboard.profiles.loading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold">{t("dashboard.title")}</h1>
        <p className="text-lg text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {error && <div className="badge badge-danger text-base p-3">{error}</div>}

      {/* Telegram Section */}
      <div className={`card ${tgConnected ? "border-success/30" : "border-accent"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-full ${tgConnected ? "bg-success" : "bg-muted-foreground"}`} />
            <span className="text-lg font-semibold">
              {t("dashboard.telegram.title")}:{" "}
              {tgConnected ? (
                <span className="text-success">{t("dashboard.telegram.connected")}</span>
              ) : (
                <span className="text-muted-foreground">{t("dashboard.telegram.notConnected")}</span>
              )}
            </span>
          </div>
          {!tgConnected && (
            <button onClick={handleConnectTelegram} disabled={tgLoading} className="btn btn-primary no-underline">
              <LinkIcon size={20} />
              {tgLoading ? t("dashboard.telegram.checking") : t("dashboard.telegram.connect")}
            </button>
          )}
        </div>

        {tgConnected && (
          <p className="mt-3 text-base text-success font-medium">{t("dashboard.telegram.connectedNote")}</p>
        )}

        {!tgConnected && tgLink && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-base mb-3">{t("dashboard.telegram.howToConnect")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-card rounded text-sm break-all border border-border">{tgLink}</code>
              <button onClick={copyLink} className="btn btn-secondary whitespace-nowrap">
                {linkCopied ? <Check size={20} /> : <Copy size={20} />}
                {linkCopied ? t("dashboard.telegram.linkCopied") : t("dashboard.telegram.copyLink")}
              </button>
            </div>
          </div>
        )}

        {!tgConnected && !tgLink && (
          <p className="mt-3 text-base text-muted-foreground">{t("dashboard.telegram.notConnectedNote")}</p>
        )}
      </div>

      {/* Profiles */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("dashboard.profiles")}</h2>
        <Link href="/dashboard/profiles/new" className="btn btn-secondary no-underline">
          <Plus size={22} />
          {t("dashboard.profiles.create")}
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="card text-center py-16">
          <SearchX size={64} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-bold mb-2">{t("dashboard.profiles.empty")}</h3>
          <p className="text-lg text-muted-foreground mb-6">{t("dashboard.profiles.emptyDesc")}</p>
          <Link href="/dashboard/profiles/new" className="btn btn-primary no-underline text-xl">
            <Plus size={22} /> {t("dashboard.profiles.createFirst")}
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">{profile.name}</h3>
                    <span className={`badge ${profile.status === "active" ? "badge-success" : "badge-warning"}`}>
                      {profile.status === "active" ? t("dashboard.profiles.active") : t("dashboard.profiles.paused")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-base text-muted-foreground">
                    {profile.city && <span>{profile.city}</span>}
                    {(profile.price_min || profile.price_max) && (
                      <span>
                        {profile.price_min ?? 0}–{profile.price_max ?? "∞"} €
                      </span>
                    )}
                    {(profile.area_min || profile.area_max) && (
                      <span>
                        {profile.area_min ?? 0}–{profile.area_max ?? "∞"} m²
                      </span>
                    )}
                    {profile.rooms_min && <span>{profile.rooms_min}+ {t("matches.rooms")}</span>}
                  </div>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {profile.balcony && <span className="badge badge-success text-xs">{t("profile.balcony")}</span>}
                    {profile.elevator && <span className="badge badge-success text-xs">{t("profile.elevator")}</span>}
                    {profile.parking && <span className="badge badge-success text-xs">{t("profile.parking")}</span>}
                    {profile.pets && <span className="badge badge-success text-xs">{t("profile.pets")}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      const newStatus = profile.status === "active" ? "suspended" : "active";
                      api.updateProfile(profile.id, { name: profile.name, is_active: newStatus === "active" } as never).then(() =>
                        setProfiles((prev) =>
                          prev.map((p) =>
                            p.id === profile.id ? { ...p, status: newStatus as "active" | "suspended" } : p
                          )
                        )
                      ).catch(() => setError(t("dashboard.profiles.statusError")));
                    }}
                    className="btn btn-outline p-2"
                    title={profile.status === "active" ? t("dashboard.profiles.togglePause") : t("dashboard.profiles.toggleActive")}
                  >
                    {profile.status === "active" ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                  </button>
                  <Link href={`/dashboard/profiles/${profile.id}/edit`} className="btn btn-outline p-2">
                    <Pencil size={20} />
                  </Link>
                  <Link href={`/dashboard/profiles/${profile.id}/matches`} className="btn btn-outline p-2">
                    <Eye size={20} />
                  </Link>
                  <button onClick={() => deleteProfile(profile.id)} className="btn btn-outline p-2 text-destructive hover:bg-destructive/10">
                    <Trash2 size={20} />
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
