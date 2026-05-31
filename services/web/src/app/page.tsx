import Link from "next/link";
import { Search, Bell, Scale } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <section className="py-16 sm:py-24 text-center">
        <div className="container max-w-3xl">
          <h1 className="hero-title mb-6">
            Finden Sie Ihre Traumwohnung
          </h1>
          <p className="hero-subtitle mx-auto mb-10">
            Wir suchen für Sie — Sie erhalten Benachrichtigungen in Telegram.
            Einfach, bequem und zuverlässig.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="btn btn-primary w-full sm:w-auto min-w-[240px] no-underline text-xl py-4 px-8"
            >
              Jetzt registrieren
            </Link>
            <Link
              href="/login"
              className="btn btn-outline w-full sm:w-auto min-w-[240px] no-underline text-xl py-4 px-8"
            >
              Ich habe schon ein Konto
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted">
        <div className="container">
          <h2 className="text-center text-2xl sm:text-3xl font-bold mb-12">
            So funktioniert&apos;s
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <Search size={32} className="text-primary-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">Suchen</h3>
              <p className="text-muted-foreground text-lg">
                Geben Sie Ihre Kriterien ein — Stadt, Preis, Größe und mehr. Wir
                durchsuchen alle großen Portale für Sie.
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                Поиск — Укажите город, цену, площадь. Мы ищем на всех сайтах.
              </p>
            </div>

            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-success rounded-full flex items-center justify-center">
                  <Scale size={32} className="text-success-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">Vergleichen</h3>
              <p className="text-muted-foreground text-lg">
                Sehen Sie alle passenden Wohnungen auf einen Blick. Vergleichen
                Sie Preise, Größen und Lagen schnell und einfach.
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                Сравнение — Все варианты в одном месте. Цены, площадь, район.
              </p>
            </div>

            <div className="card text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-accent rounded-full flex items-center justify-center">
                  <Bell size={32} className="text-accent-foreground" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2">Benachrichtigen</h3>
              <p className="text-muted-foreground text-lg">
                Neue passende Angebote kommen direkt in Ihren Telegram-Chat. Sie
                verpassen nie wieder eine gute Wohnung.
              </p>
              <p className="text-accent-foreground text-base mt-2 font-medium">
                Уведомления — Новые квартиры сразу в Telegram. Ничего не
                пропустите.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 text-center">
        <div className="container max-w-2xl">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Bereit, Ihre Suche zu starten?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Erstellen Sie ein Konto in wenigen Sekunden und erhalten Sie sofort
            passende Wohnungsangebote in Ihrem Telegram.
          </p>
          <Link
            href="/register"
            className="btn btn-secondary no-underline text-xl py-4 px-8 min-w-[240px]"
          >
            Kostenlos starten
          </Link>
        </div>
      </section>
    </>
  );
}
