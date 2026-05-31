import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import LayoutContentClient from "./LayoutContentClient";

export const metadata: Metadata = {
  title: "SucheWohnung",
  description: "Поиск квартир в Германии с уведомлениями в Telegram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        <AuthProvider>
          <LocaleProvider>
            <LayoutContentClient>{children}</LayoutContentClient>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
