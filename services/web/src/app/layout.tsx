import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SucheWohnung — Поиск квартир в Германии",
  description: "Агрегатор объявлений о квартирах с уведомлениями в Telegram",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
