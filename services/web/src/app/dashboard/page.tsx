"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Eye, ToggleLeft, ToggleRight, LinkIcon, SearchX, Copy, Check, Home } from "lucide-react";
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
      setError("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("401") && !msg.includes("Unauthorized")) {
        setError(t("dashboard.profiles.loadError"));
      }
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

  useEffect(() => {
    if (tgConnected) return;
    const interval = setInterval(() => {
      api.getTelegramLink().then(tg => {
        if (tg.connected) {
          setTgConnected(true);
          clearInterval(interval);
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [tgConnected]);

  const handleConnectTelegram = async () => {
    setTgLoading(true);
    try {
      const tg = await api.getTelegramLink();
      setTgLink(tg.link ?? "");
      setTgConnected(tg.connected ?? false);
      if (tg.link) {
        window.open(tg.link, "_blank", "noopener,noreferrer");
      }
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
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.profiles.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{t("dashboard.subtitle")}</p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      <div className={`relative overflow-hidden rounded-2xl border-2 ${tgConnected ? "border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"} shadow-sm`}>
        {!tgConnected && (
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5" />
        )}
        <div className="relative p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${tgConnected ? "bg-emerald-500 shadow-sm shadow-emerald-500/30" : "bg-slate-300 dark:bg-slate-600"}`} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("dashboard.telegram.title")}:{" "}
                {tgConnected ? (
                  <span className="text-emerald-600 dark:text-emerald-400">{t("dashboard.telegram.connected")}</span>
                ) : (
                  <span className="text-slate-400">{t("dashboard.telegram.notConnected")}</span>
                )}
              </span>
            </div>
            {!tgConnected && (
              <button onClick={handleConnectTelegram} disabled={tgLoading} className="btn btn-primary text-sm">
                <LinkIcon size={16} />
                {tgLoading ? t("dashboard.telegram.checking") : t("dashboard.telegram.connect")}
              </button>
            )}
          </div>

          {tgConnected && (
            <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              {t("dashboard.telegram.connectedNote")}
            </p>
          )}

          {!tgConnected && tgLink && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t("dashboard.telegram.howToConnect")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-white dark:bg-slate-900 rounded-lg text-xs break-all border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                  {tgLink}
                </code>
                <button onClick={copyLink} className="btn btn-secondary text-sm whitespace-nowrap flex-shrink-0">
                  {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                  {linkCopied ? t("dashboard.telegram.linkCopied") : t("dashboard.telegram.copyLink")}
                </button>
              </div>
            </div>
          )}

          {!tgConnected && !tgLink && (
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">{t("dashboard.telegram.notConnectedNote")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("dashboard.profiles")}</h2>
        <Link href="/dashboard/profiles/new" className="btn btn-primary text-sm">
          <Plus size={16} />
          {t("dashboard.profiles.create")}
        </Link>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <SearchX size={32} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2">{t("dashboard.profiles.empty")}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t("dashboard.profiles.emptyDesc")}</p>
          <Link href="/dashboard/profiles/new" className="btn btn-primary">
            <Plus size={16} /> {t("dashboard.profiles.createFirst")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="card card-hover">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2.5">
                    <h3 className="text-lg font-extrabold text-slate-900 dark:text-white truncate">{profile.name}</h3>
                    <span className={`badge ${profile.status === "active" ? "badge-success" : "badge-warning"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${profile.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {profile.status === "active" ? t("dashboard.profiles.active") : t("dashboard.profiles.paused")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-500 dark:text-slate-400 mb-2">
                    {profile.city && (
                      <span className="inline-flex items-center gap-1">
                        <Home size={14} className="text-slate-400" />
                        {profile.city}
                      </span>
                    )}
                    {(profile.price_min || profile.price_max) && (
                      <span>{profile.price_min ?? 0}–{profile.price_max ?? "∞"} €</span>
                    )}
                    {(profile.area_min || profile.area_max) && (
                      <span>{profile.area_min ?? 0}–{profile.area_max ?? "∞"} m²</span>
                    )}
                    {profile.rooms_min && <span>{profile.rooms_min}+ {t("matches.rooms")}</span>}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {profile.balcony && <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{t("profile.balcony")}</span>}
                    {profile.elevator && <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">{t("profile.elevator")}</span>}
                    {profile.parking && <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{t("profile.parking")}</span>}
                    {profile.pets && <span className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">{t("profile.pets")}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={profile.status === "active" ? t("dashboard.profiles.togglePause") : t("dashboard.profiles.toggleActive")}
                  >
                    {profile.status === "active" ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} className="text-slate-400" />}
                  </button>
                  <Link href={`/dashboard/profiles/${profile.id}/edit`} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
                    <Pencil size={18} />
                  </Link>
                  <Link href={`/dashboard/profiles/${profile.id}/matches`} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors">
                    <Eye size={18} />
                  </Link>
                  <button onClick={() => deleteProfile(profile.id)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
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
