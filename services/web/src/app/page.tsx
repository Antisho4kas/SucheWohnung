"use client";

import Link from "next/link";
import { Search, Bell, Scale } from "lucide-react";
import { useLocale } from "@/lib/i18n";

export default function HomePage() {
  const { t } = useLocale();

  return (
    <>
      <section className="py-16 sm:py-24 text-center">
        <div className="container max-w-3xl">
          <h1 className="hero-title mb-6">{t("hero.title")}</h1>
          <p className="hero-subtitle mx-auto mb-10">{t("hero.subtitle")}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="btn btn-primary w-full sm:w-auto min-w-[240px] no-underline text-xl py-4 px-8"
            >
              {t("hero.cta.register")}
            </Link>
            <Link
              href="/login"
              className="btn btn-outline w-full sm:w-auto min-w-[240px] no-underline text-xl py-4 px-8"
            >
              {t("hero.cta.login")}
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted">
        <div className="container">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-12">
            {t("hero.howItWorks")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <Search size={32} className="text-primary-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">
                {t("features.search.title")}
              </h3>
              <p className="text-muted-foreground text-lg">
                {t("features.search.long")}
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                {t("features.search.ru")}
              </p>
            </div>

            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-success rounded-full flex items-center justify-center">
                  <Scale size={32} className="text-success-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">
                {t("features.compare.title")}
              </h3>
              <p className="text-muted-foreground text-lg">
                {t("features.compare.long")}
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                {t("features.compare.ru")}
              </p>
            </div>

            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center">
                  <Bell size={32} className="text-accent-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">
                {t("features.notify.title")}
              </h3>
              <p className="text-muted-foreground text-lg">
                {t("features.notify.long")}
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                {t("features.notify.ru")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <div className="container max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            {t("hero.cta.bottomReady")}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            {t("hero.cta.bottomDesc")}
          </p>
          <Link
            href="/register"
            className="btn btn-secondary no-underline text-xl py-4 px-8 min-w-[240px]"
          >
            {t("hero.cta.bottom")}
          </Link>
        </div>
      </section>
    </>
  );
}
