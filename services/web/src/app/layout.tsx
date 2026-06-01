import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import LayoutContentClient from "./LayoutContentClient";

export const metadata: Metadata = {
  title: "SucheWohnung — Поиск квартир в Германии",
  description: "Агрегатор объявлений о квартирах с уведомлениями в Telegram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <ThemeProvider>
          <AuthProvider>
            <LocaleProvider>
              <LayoutContentClient>{children}</LayoutContentClient>
            </LocaleProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
