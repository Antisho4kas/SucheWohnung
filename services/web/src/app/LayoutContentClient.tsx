"use client";

import Link from "next/link";
import { Home, LogIn } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function LayoutContentClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const currentYear = new Date().getFullYear();

  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-border bg-card shadow-sm">
        <div className="container flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-extrabold text-xl no-underline hover:opacity-80 transition-opacity"
          >
            <Home size={28} strokeWidth={2.5} />
            <span className="hidden sm:inline">SucheWohnung</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-lg font-semibold">
            <Link
              href="/"
              className="text-foreground hover:text-primary no-underline transition-colors"
            >
              {t("nav.home")}
            </Link>
            <Link
              href="/dashboard"
              className="text-foreground hover:text-primary no-underline transition-colors"
            >
              {t("nav.dashboard")}
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="btn btn-primary no-underline text-base"
            >
              <LogIn size={20} />
              <span className="hidden sm:inline">{t("nav.login")}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-12">{children}</main>

      <footer className="border-t-2 border-border bg-card mt-auto">
        <div className="container py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-base">
            <div>
              <h3 className="font-bold text-lg mb-2">SucheWohnung</h3>
              <p className="text-muted-foreground">{t("footer.description")}</p>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">{t("footer.links")}</h3>
              <ul className="space-y-1">
                <li>
                  <Link href="/" className="no-underline hover:text-primary">{t("nav.home")}</Link>
                </li>
                <li>
                  <Link href="/login" className="no-underline hover:text-primary">{t("nav.login")}</Link>
                </li>
                <li>
                  <Link href="/register" className="no-underline hover:text-primary">{t("nav.register")}</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">{t("footer.contact")}</h3>
              <p className="text-muted-foreground">{t("footer.contactText")}</p>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-border text-center text-muted-foreground text-base">
            {t("footer.copyright", { year: String(currentYear) })}
          </div>
        </div>
      </footer>
    </>
  );
}
