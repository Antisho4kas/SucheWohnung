import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Home, LogIn } from "lucide-react";

export const metadata: Metadata = {
  title: "SucheWohnung",
  description: "Агрегатор объявлений о квартирах с уведомлениями в Telegram",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <AuthProvider>
          <LocaleProvider>
            <LayoutContent>{children}</LayoutContent>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
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
              Start
            </Link>
            <Link
              href="/dashboard"
              className="text-foreground hover:text-primary no-underline transition-colors"
            >
              Dashboard
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="btn btn-primary no-underline text-base"
            >
              <LogIn size={20} />
              <span className="hidden sm:inline">Anmelden</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t-2 border-border bg-card mt-auto">
        <div className="container py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-base">
            <div>
              <h3 className="font-bold text-lg mb-2">SucheWohnung</h3>
              <p className="text-muted-foreground">
                Ihr Begleiter bei der Wohnungssuche in Deutschland
              </p>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">Links</h3>
              <ul className="space-y-1">
                <li>
                  <Link href="/" className="no-underline hover:text-primary">
                    Startseite
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="no-underline hover:text-primary">
                    Anmelden
                  </Link>
                </li>
                <li>
                  <Link href="/register" className="no-underline hover:text-primary">
                    Registrieren
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">Kontakt</h3>
              <p className="text-muted-foreground">
                Bei Fragen helfen wir Ihnen gerne weiter.
              </p>
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-border text-center text-muted-foreground text-base">
            &copy; {currentYear} SucheWohnung. Alle Rechte vorbehalten.
          </div>
        </div>
      </footer>
    </>
  );
}
