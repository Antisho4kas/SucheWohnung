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
        <p className="text-xl text-muted-foreground">{t("admin.loading")}</p>
      </div>
    );
  }

  const statCards = [
    { key: "users", label: t("admin.stats.users"), value: stats?.users ?? 0, icon: Users },
    { key: "listings", label: t("admin.stats.listings"), value: stats?.listings ?? 0, icon: Building2 },
    { key: "matches", label: t("admin.stats.matches"), value: stats?.matches ?? 0, icon: Heart },
    { key: "notifications", label: t("admin.stats.notifications"), value: stats?.notifications ?? 0, icon: Bell },
  ];

  const queueLabels: Record<string, string> = {
    collect: t("admin.queues.collect"),
    match: t("admin.queues.match"),
    notify: t("admin.queues.notify"),
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h1 className="text-3xl font-extrabold">{t("admin.title")}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ key, label, value, icon: Icon }) => (
          <div key={key} className="card text-center">
            <Icon size={28} className="mx-auto text-primary mb-2" />
            <p className="text-3xl font-extrabold">{value.toLocaleString()}</p>
            <p className="text-lg text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-2xl font-bold mb-4">{t("admin.sources")}</h2>
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div>
                <p className="text-lg font-semibold">{source.name}</p>
                <p className="text-base text-muted-foreground">
                  {source.listings_count} {t("admin.sources.listingsCount")}
                </p>
              </div>
              <button
                onClick={() => toggleSource(source.id, source.enabled)}
                className={`btn ${
                  source.enabled ? "btn-primary" : "btn-outline"
                }`}
              >
                {source.enabled ? (
                  <ToggleRight size={22} />
                ) : (
                  <ToggleLeft size={22} />
                )}
                {source.enabled
                  ? t("admin.sources.enabled")
                  : t("admin.sources.disabled")}
              </button>
            </div>
          ))}
        </div>
      </div>

      {queue && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{t("admin.queues")}</h2>
            <button onClick={fetchAll} className="btn btn-outline p-2">
              <RefreshCw size={20} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(["collect", "match", "notify"] as const).map((key) => {
              const q = queue[key];
              return (
                <div key={key} className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-lg font-bold">{queueLabels[key]}</p>
                  <p className="text-2xl font-extrabold">
                    {q.active + q.waiting}
                  </p>
                  <p className="text-base text-muted-foreground">
                    {q.active} {t("common.active").toLowerCase()}, {q.waiting}{" "}
                    {t("common.paused").toLowerCase()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-2xl font-bold mb-4">{t("admin.logs")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-lg">
            <thead>
              <tr className="border-b-2 border-border text-left">
                <th className="py-3 pr-4 font-bold">{t("admin.logs.action")}</th>
                <th className="py-3 pr-4 font-bold">{t("admin.logs.details")}</th>
                <th className="py-3 font-bold">{t("admin.logs.time")}</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-border">
                  <td className="py-3 pr-4 font-semibold">{log.action}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {log.details}
                  </td>
                  <td className="py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("de-DE")}
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="py-6 text-center text-muted-foreground"
                  >
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
