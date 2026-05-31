export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">SucheWohnung</h1>
      <p className="text-lg text-muted-foreground">
        Поиск квартир в Германии с мгновенными уведомлениями в Telegram
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="/login"
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          Войти
        </a>
        <a
          href="/register"
          className="px-4 py-2 rounded-md border border-border hover:bg-secondary"
        >
          Регистрация
        </a>
      </div>
    </main>
  );
}
