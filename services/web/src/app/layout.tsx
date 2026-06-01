import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import LayoutContentClient from "./LayoutContentClient";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SucheWohnung — Wohnungssuche in Deutschland",
  description: "Aggregator für deutsche Wohnungsanzeigen mit Telegram-Benachrichtigungen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={inter.variable}>
      <body className="min-h-screen bg-background text-foreground flex flex-col antialiased">
        <AuthProvider>
          <LocaleProvider>
            <LayoutContentClient>{children}</LayoutContentClient>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
