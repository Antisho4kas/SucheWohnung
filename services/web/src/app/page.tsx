"use client";

import Link from "next/link";
import { Search, Bell, Scale, ArrowRight, Home as HomeIcon, Users, Building2 } from "lucide-react";
import { useLocale } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useLocale();

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-indigo-600/10 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-sm text-slate-300 mb-8 backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {t("hero.badge")}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
              {t("hero.title")}
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 transition-all active:scale-[0.98]"
              >
                {t("hero.cta.register")}
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white/20 text-white font-semibold rounded-xl hover:bg-white/10 hover:border-white/30 transition-all active:scale-[0.98]"
              >
                {t("hero.cta.login")}
              </Link>
            </div>
          </div>

          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Building2 size={20} className="text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">250+</p>
                <p className="text-sm text-slate-400">{t("hero.stats.listings")}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">100+</p>
                <p className="text-sm text-slate-400">{t("hero.stats.searchers")}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Bell size={20} className="text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-white">500+</p>
                <p className="text-sm text-slate-400">{t("hero.stats.notifications")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 dark:from-slate-950 to-transparent" />
      </section>

      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
              {t("hero.howItWorks")}
            </h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
              {t("hero.howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card card-hover text-center group">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Search size={30} className="text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-3">
                {t("features.search.title")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {t("features.search.long")}
              </p>
            </div>

            <div className="card card-hover text-center group">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Scale size={30} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-3">
                {t("features.compare.title")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {t("features.compare.long")}
              </p>
            </div>

            <div className="card card-hover text-center group">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Bell size={30} className="text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-3">
                {t("features.notify.title")}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
                {t("features.notify.long")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 bg-slate-50 dark:bg-slate-900/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <HomeIcon size={30} className="text-primary" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
            {t("hero.cta.bottomReady")}
          </h2>
          <p className="text-lg text-slate-500 dark:text-slate-400 mb-8 max-w-xl mx-auto">
            {t("hero.cta.bottomDesc")}
          </p>
          <Link
            href="/register"
            className="btn btn-primary btn-lg"
          >
            {t("hero.cta.bottom")}
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>
    </div>
  );
}
