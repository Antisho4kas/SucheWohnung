"use client";

import { useCallback, useEffect, useState } from "react";
import { LinkIcon, Copy, Check, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function TelegramPage() {
  const { t } = useLocale();
  const [connected, setConnected] = useState(false);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const tg = await api.getTelegramLink();
      setConnected(tg.connected ?? false);
      if (!tg.connected && tg.link) setLink(tg.link);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (connected) return;
    const interval = setInterval(() => {
      api
        .getTelegramLink()
        .then((tg) => {
          if (tg.connected) {
            setConnected(true);
            clearInterval(interval);
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [connected]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const tg = await api.getTelegramLink();
      setLink(tg.link ?? "");
      setConnected(tg.connected ?? false);
      if (tg.link) window.open(tg.link, "_blank", "noopener,noreferrer");
    } catch {
      setError(t("common.error"));
    } finally {
      setConnecting(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Send size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {t("dashboard.telegram.title")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("dashboard.subtitle")}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div
          className={`relative overflow-hidden rounded-2xl border-2 ${
            connected
              ? "border-emerald-200 dark:border-emerald-800"
              : "border-slate-200 dark:border-slate-800"
          } bg-white dark:bg-slate-900 shadow-sm`}
        >
          <div className="relative p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    connected
                      ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                      : "bg-slate-300 dark:bg-slate-600"
                  }`}
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {t("dashboard.telegram.title")}:{" "}
                  {connected ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t("dashboard.telegram.connected")}
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      {t("dashboard.telegram.notConnected")}
                    </span>
                  )}
                </span>
              </div>
              {!connected && (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="btn btn-primary text-sm"
                >
                  <LinkIcon size={16} />
                  {connecting
                    ? t("dashboard.telegram.checking")
                    : t("dashboard.telegram.connect")}
                </button>
              )}
            </div>

            {connected && (
              <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {t("dashboard.telegram.connectedNote")}
              </p>
            )}

            {!connected && link && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                  {t("dashboard.telegram.howToConnect")}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-white dark:bg-slate-900 rounded-lg text-xs break-all border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                    {link}
                  </code>
                  <button
                    onClick={copyLink}
                    className="btn btn-secondary text-sm whitespace-nowrap flex-shrink-0"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied
                      ? t("dashboard.telegram.linkCopied")
                      : t("dashboard.telegram.copyLink")}
                  </button>
                </div>
              </div>
            )}

            {!connected && !link && (
              <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
                {t("dashboard.telegram.notConnectedNote")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
