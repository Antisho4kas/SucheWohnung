"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Plus, Send, LogOut, Menu, X, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocale } from "@/lib/i18n";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: t("dashboard.profiles"), icon: LayoutDashboard },
    { href: "/dashboard/profiles/new", label: t("dashboard.profiles.create"), icon: Plus },
    { href: "/dashboard/telegram", label: t("dashboard.telegram.title"), icon: Send },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <button
        className="lg:hidden fixed bottom-4 left-4 z-50 w-12 h-12 bg-primary text-white rounded-2xl shadow-lg flex items-center justify-center hover:brightness-110 transition-all"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        className={`fixed lg:sticky top-16 left-0 z-40 w-64 h-[calc(100vh-4rem)] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full p-4">
          <div className="px-3 py-2 mb-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Navigation
            </p>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                    active
                      ? "bg-primary text-white shadow-sm shadow-primary/25"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon size={20} className={`${active ? "" : "group-hover:text-primary transition-colors"}`} />
                  {item.label}
                  {active && <ChevronRight size={16} className="ml-auto" />}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
            {user && (
              <div className="flex items-center gap-3 px-4 py-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {user.email?.charAt(0).toUpperCase() ?? "U"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">{user.role}</p>
                </div>
              </div>
            )}
            <button
              onClick={() => { logout(); setMobileOpen(false); }}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full transition-colors"
            >
              <LogOut size={20} />
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto bg-slate-50/50 dark:bg-slate-950/50">
        {children}
      </main>
    </div>
  );
}
