"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Send, LogOut, Menu, X, Plus } from "lucide-react";
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
        className="md:hidden fixed top-16 left-0 z-40 btn btn-outline m-2 p-3"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Menu"
      >
        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <aside
        className={`fixed md:sticky top-16 left-0 z-30 w-64 h-[calc(100vh-4rem)] bg-card border-r-2 border-border transform transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full p-4">
          <nav className="flex-1 space-y-1 mt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-semibold no-underline transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon size={22} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t-2 border-border pt-4">
            {user && (
              <p className="px-4 text-sm text-muted-foreground truncate mb-2">
                {user.email}
              </p>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-lg font-semibold text-destructive hover:bg-muted w-full no-underline transition-colors"
            >
              <LogOut size={22} />
              {t("nav.logout")}
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="flex-1 p-4 sm:p-8 overflow-auto">{children}</main>
    </div>
  );
}
