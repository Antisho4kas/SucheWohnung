"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, ExternalLink, SearchX } from "lucide-react";
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

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={36} className="animate-spin text-primary" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-3xl font-extrabold">{t("matches.title")}</h1>

      {matches.length === 0 ? (
        <div className="card text-center py-16">
          <SearchX size={48} className="mx-auto mb-4 text-muted-foreground" />
          <p className="text-xl text-muted-foreground">{t("matches.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} className="card">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-xl font-bold">{m.listing?.title ?? `Listing ${m.listingId}`}</h3>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-base text-muted-foreground">
                    {m.listing?.price && <span>{m.listing.price} €</span>}
                    {m.listing?.city && <span>{m.listing.city}</span>}
                    <span className="text-xs text-muted-foreground">{new Date(m.matchedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {m.listing?.url && (
                  <a href={m.listing.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary no-underline shrink-0">
                    <ExternalLink size={20} /> {t("matches.viewListing")}
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
