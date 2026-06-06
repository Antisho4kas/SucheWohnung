"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api, type FilterDefinition } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { ProfileForm } from "@/components/ProfileForm";
import Link from "next/link";

export default function NewProfilePage() {
  const router = useRouter();
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterDefinitions, setFilterDefinitions] = useState<
    FilterDefinition[]
  >([]);

  useEffect(() => {
    api
      .getFilterDefinitions()
      .then((defs) => {
        setFilterDefinitions(defs);
        setError("");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("common.error"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  const handleSubmit = async (payload: {
    name: string;
    notify: boolean;
    filters: { key: string; operator: string; value?: unknown }[];
  }) => {
    setError("");
    setSaving(true);
    try {
      await api.createProfile({
        name: payload.name,
        notify: payload.notify,
        filters: payload.filters,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("profile.createError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-4 transition-colors"
        >
          <ArrowLeft size={16} /> {t("nav.dashboard")}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t("dashboard.profiles.create")}
        </h1>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      <ProfileForm
        filterDefinitions={filterDefinitions}
        loading={saving}
        onSubmit={handleSubmit}
      />

      <Link href="/dashboard" className="btn btn-outline w-full sm:w-auto">
        {t("profile.cancel")}
      </Link>
    </div>
  );
}
