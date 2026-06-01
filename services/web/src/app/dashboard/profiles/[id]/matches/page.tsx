"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ExternalLink, SearchX, ArrowLeft } from "lucide-react";
import { api, type Match } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

export default function MatchesPage() {
  const params = useParams();
  const id = params.id as string;
  const { t } = useLocale();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMatches(id).then(setMatches).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mb-4 transition-colors">
          <ArrowLeft size={16} /> {t("nav.dashboard")}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("matches.title")}</h1>
      </div>

      {matches.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <SearchX size={32} className="text-slate-400" />
          </div>
          <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">{t("matches.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} className="card card-hover">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="min-w-0">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white truncate">
                    {m.listing?.title ?? `Listing ${m.listingId}`}
                  </h3>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {m.listing?.price && <span className="font-semibold text-slate-700 dark:text-slate-200">{m.listing.price} €</span>}
                    {m.listing?.city && <span>{m.listing.city}</span>}
                    <span className="text-xs text-slate-400">
                      {new Date(m.matchedAt).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                </div>
                {m.listing?.url && (
                  <a
                    href={m.listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary text-sm shrink-0"
                  >
                    <ExternalLink size={16} /> {t("matches.viewListing")}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
