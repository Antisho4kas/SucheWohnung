"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ProfileForm } from "@/components/ProfileForm";
import {
  api,
  type FilterDefinition,
  type FilterInput,
  type ProfileFilterFormValues,
  type SearchProfile,
} from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function EditProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useLocale();
  const id = params.id as string;

  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [filterDefinitions, setFilterDefinitions] = useState<
    FilterDefinition[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api.getProfiles(), api.getFilterDefinitions()])
      .then(([profiles, definitions]) => {
        if (!active) return;
        const found = profiles.find((p) => p.id === id);
        if (!found) {
          setError(t("profile.notFound"));
          return;
        }
        setProfile(found);
        setFilterDefinitions(definitions);
        setError("");
      })
      .catch(() => {
        if (active) setError(t("profile.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, t]);

  const handleSubmit = async (payload: {
    name: string;
    notify: boolean;
    autoReplyEnabled: boolean;
    autoReplyText: string;
    filters: FilterInput[];
    values: ProfileFilterFormValues;
  }) => {
    setError("");
    setSaving(true);
    try {
      await api.updateProfile(id, {
        name: payload.name,
        notify: payload.notify,
        auto_reply_enabled: payload.autoReplyEnabled,
        auto_reply_text: payload.autoReplyText,
        filters: payload.filters,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("profile.updateError"));
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

  if (error && !profile) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card text-center">
          <p className="text-sm text-red-500 font-medium">{error}</p>
        </div>
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
          {t("dashboard.profiles.edit")}
        </h1>
        {profile && (
          <p className="text-sm text-slate-400 mt-1">{profile.name}</p>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {profile && (
        <ProfileForm
          filterDefinitions={filterDefinitions}
          initialName={profile.name}
          initialNotify={profile.notify}
          initialAutoReplyEnabled={profile.auto_reply_enabled}
          initialAutoReplyText={profile.auto_reply_text ?? ""}
          initialValues={profile.filterValues}
          loading={saving}
          onSubmit={handleSubmit}
        />
      )}

      <Link href="/dashboard" className="btn btn-outline w-full sm:w-auto">
        {t("profile.cancel")}
      </Link>
    </div>
  );
}
