"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Building2,
  Heart,
  Bell,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Server,
  Layers,
  Activity,
} from "lucide-react";
import type {
  AdminStats,
  AdminSource,
  AdminQueueStatus,
  AdminAuditLog,
} from "@/lib/api";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function AdminPage() {
  const { t } = useLocale();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [queue, setQueue] = useState<AdminQueueStatus | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [s, src, q, a] = await Promise.all([
        api.getAdminStats(),
        api.getAdminSources(),
        api.getQueueStatus(),
        api.getAuditLogs(),
      ]);
      setStats(s);
      setSources(src);
      setQueue(q);
      setAuditLogs(a.slice(0, 20));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const toggleSource = async (id: string, enabled: boolean) => {
    try {
      await api.toggleSource(id, !enabled);
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !enabled } : s)),
      );
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">{t("admin.loading")}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { key: "users", label: t("admin.stats.users"), value: stats?.users ?? 0, icon: Users, color: "blue" },
    { key: "listings", label: t("admin.stats.listings"), value: stats?.listings ?? 0, icon: Building2, color: "emerald" },
    { key: "matches", label: t("admin.stats.matches"), value: stats?.matches ?? 0, icon: Heart, color: "rose" },
    { key: "notifications", label: t("admin.stats.notifications"), value: stats?.notifications ?? 0, icon: Bell, color: "amber" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
    amber: "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("admin.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Systemübersicht und Verwaltung</p>
        </div>
        <button onClick={fetchAll} className="btn btn-outline text-sm">
          <RefreshCw size={16} /> Aktualisieren
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ key, label, value, icon: Icon, color }) => (
          <div key={key} className="card card-hover text-center">
            <div className={`w-12 h-12 rounded-2xl ${colorMap[color]} flex items-center justify-center mx-auto mb-3`}>
              <Icon size={22} />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{value.toLocaleString()}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Server size={20} className="text-primary" />
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t("admin.sources")}</h2>
        </div>
        <div className="space-y-1">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between py-3.5 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${source.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{source.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {source.listings_count} {t("admin.sources.listingsCount")}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleSource(source.id, source.enabled)}
                className={`btn text-xs px-4 py-1.5 ${source.enabled ? "btn-primary" : "btn-outline"}`}
              >
                {source.enabled ? (
                  <ToggleRight size={16} />
                ) : (
                  <ToggleLeft size={16} />
                )}
                {source.enabled
                  ? t("admin.sources.enabled")
                  : t("admin.sources.disabled")}
              </button>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">Keine Quellen konfiguriert</p>
          )}
        </div>
      </div>

      {queue && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <Activity size={20} className="text-primary" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t("admin.queues")}</h2>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(["collect", "match", "notify"] as const).map((key) => {
              const q = queue[key];
              const colors: Record<string, string> = {
                collect: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
                match: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
                notify: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800",
              };
              const queueLabels: Record<string, string> = {
                collect: t("admin.queues.collect"),
                match: t("admin.queues.match"),
                notify: t("admin.queues.notify"),
              };
              return (
                <div key={key} className={`rounded-2xl border p-5 text-center ${colors[key]}`}>
                  <Layers size={22} className="mx-auto mb-2 text-slate-600 dark:text-slate-400" />
                  <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">{queueLabels[key]}</p>
                  <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{q.active + q.waiting}</p>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                      {q.active} {t("common.active").toLowerCase()}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      <span className="inline-block w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 mr-1" />
                      {q.waiting} {t("common.paused").toLowerCase()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Activity size={20} className="text-primary" />
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t("admin.logs")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left">
                <th className="py-3 pr-4 font-extrabold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
                  {t("admin.logs.action")}
                </th>
                <th className="py-3 pr-4 font-extrabold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
                  {t("admin.logs.details")}
                </th>
                <th className="py-3 font-extrabold text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
                  {t("admin.logs.time")}
                </th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{log.action}</span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                    {log.details}
                  </td>
                  <td className="py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("de-DE")}
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-sm text-slate-400">
                    {t("admin.logs.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
