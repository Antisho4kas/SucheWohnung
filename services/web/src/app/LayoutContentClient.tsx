"use client";

import Link from "next/link";
import { Home, LogIn, User, LogOut, Search, Menu, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useState } from "react";

export default function LayoutContentClient({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { user, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link
              href="/"
              className="flex items-center gap-2.5 font-extrabold text-xl tracking-tight hover:opacity-85 transition-opacity"
            >
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                <Home size={20} className="text-primary-foreground" />
              </div>
              <span className="hidden sm:inline text-slate-900 dark:text-white">SucheWohnung</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <div className="relative mr-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={t("nav.searchPlaceholder")}
                  readOnly
                  className="w-56 pl-9 pr-4 py-2 text-sm bg-slate-100 dark:bg-slate-800 border-transparent rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:border-primary/30 cursor-default"
                  tabIndex={-1}
                />
              </div>
              <Link
                href="/"
                className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("nav.home")}
              </Link>
              {isAuthenticated && (
                <Link
                  href="/dashboard"
                  className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("nav.dashboard")}
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2">
              <LanguageSwitcher />

              {isAuthenticated ? (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                      {user?.email?.charAt(0).toUpperCase() ?? "U"}
                    </div>
                    <span className="hidden sm:inline text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {user?.email}
                    </span>
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 py-2 animate-fade-in">
                        <Link
                          href="/dashboard"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <User size={18} /> {t("nav.dashboard")}
                        </Link>
                        <button
                          onClick={() => {
                            logout();
                            setMenuOpen(false);
                          }}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full text-left transition-colors"
                        >
                          <LogOut size={18} /> {t("nav.logout")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="btn btn-primary text-sm py-2 px-4"
                >
                  <LogIn size={16} />
                  <span className="hidden sm:inline">{t("nav.login")}</span>
                </Link>
              )}

              <button
                className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Menu"
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="md:hidden pb-4 border-t border-slate-200 dark:border-slate-800 mt-2 pt-3 animate-fade-in">
              <nav className="flex flex-col gap-1">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t("nav.home")}
                </Link>
                {isAuthenticated && (
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="px-3 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {t("nav.dashboard")}
                  </Link>
                )}
              </nav>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-slate-900 dark:bg-slate-950 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Home size={16} className="text-primary-foreground" />
                </div>
                <span className="font-extrabold text-lg text-white">SucheWohnung</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">{t("footer.description")}</p>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white mb-4 uppercase tracking-wider">{t("footer.links")}</h3>
              <ul className="space-y-2.5">
                <li>
                  <Link href="/" className="text-slate-400 text-sm hover:text-white transition-colors">{t("nav.home")}</Link>
                </li>
                <li>
                  <Link href="/login" className="text-slate-400 text-sm hover:text-white transition-colors">{t("nav.login")}</Link>
                </li>
                <li>
                  <Link href="/register" className="text-slate-400 text-sm hover:text-white transition-colors">{t("nav.register")}</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-sm text-white mb-4 uppercase tracking-wider">{t("footer.contact")}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{t("footer.contactText")}</p>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-slate-800 text-center">
            <p className="text-slate-500 text-sm">{t("footer.copyright", { year: String(currentYear) })}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
