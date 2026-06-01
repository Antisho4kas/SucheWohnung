"use client";

import Link from "next/link";
import { Home, LogIn, User, Sun, Moon, LogOut } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useState } from "react";

export default function LayoutContentClient({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const { user, logout, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-border bg-card/90 backdrop-blur-sm shadow-sm">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-primary font-extrabold text-xl no-underline hover:opacity-80 transition-opacity">
            <Home size={26} strokeWidth={2.5} />
            <span className="hidden sm:inline">SucheWohnung</span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-lg font-semibold">
            <Link href="/" className="text-foreground hover:text-primary no-underline transition-colors">{t("nav.home")}</Link>
            {isAuthenticated && <Link href="/dashboard" className="text-foreground hover:text-primary no-underline transition-colors">{t("nav.dashboard")}</Link>}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button onClick={toggleTheme} className="btn btn-ghost p-2 min-h-0" title={theme === "dark" ? "Light" : "Dark"}>
              {theme === "dark" ? <Sun size={22} /> : <Moon size={22} />}
            </button>

            {isAuthenticated ? (
              <div className="relative">
                <button onClick={() => setMenuOpen(!menuOpen)} className="btn btn-ghost p-2 gap-2 min-h-0">
                  <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-base">
                    {user?.email?.charAt(0).toUpperCase() ?? "U"}
                  </div>
                  <span className="hidden sm:inline text-base">{user?.email}</span>
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 card py-2 min-w-[200px] shadow-lg">
                      <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-3 hover:bg-muted no-underline text-foreground text-lg">
                        <User size={20} /> {t("nav.dashboard")}
                      </Link>
                      <button onClick={() => { logout(); setMenuOpen(false); }} className="flex items-center gap-2 px-4 py-3 hover:bg-muted w-full text-left text-destructive text-lg">
                        <LogOut size={20} /> {t("nav.logout")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Link href="/login" className="btn btn-primary no-underline text-base">
                <LogIn size={20} /> <span className="hidden sm:inline">{t("nav.login")}</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 py-8 pb-16">{children}</main>

      <footer className="border-t-2 border-border bg-card mt-auto">
        <div className="container py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 text-base">
            <div>
              <h3 className="font-bold text-lg mb-3">SucheWohnung</h3>
              <p className="text-muted-foreground leading-relaxed">{t("footer.description")}</p>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-3">{t("footer.links")}</h3>
              <ul className="space-y-2">
                <li><Link href="/" className="no-underline hover:text-primary">{t("nav.home")}</Link></li>
                <li><Link href="/login" className="no-underline hover:text-primary">{t("nav.login")}</Link></li>
                <li><Link href="/register" className="no-underline hover:text-primary">{t("nav.register")}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-3">{t("footer.contact")}</h3>
              <p className="text-muted-foreground leading-relaxed">{t("footer.contactText")}</p>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-border text-center text-muted-foreground text-base">
            {t("footer.copyright", { year: String(currentYear) })}
          </div>
        </div>
      </footer>
    </>
  );
}
