#!/usr/bin/env bash
# Hourly source-health check for the kleinanzeigen scraper.
#
# kleinanzeigen periodically blocks the proxy IP, which silently drops the
# real-listing feed to zero (mock listings keep flowing, so the app looks
# "up" while notifications quietly stop). This script counts kleinanzeigen
# listings ingested in the recent window and, if none arrived, sends one
# Telegram alert so the proxy can be rotated before users notice the silence.
#
# Installed as an hourly cron on the VPS (see ops/monitor/README or the
# crontab entry). Idempotent: writes a small state file so it alerts on the
# transition into "stalled" and again on recovery, not every single hour.

set -euo pipefail

APP_DIR="/home/deploy/apps/suchewohnung"
STATE_FILE="/home/deploy/apps/suchewohnung/ops/monitor/.source-state"
WINDOW_MIN="${WINDOW_MIN:-90}"     # how far back to look for fresh listings
PG_CONTAINER="suchewohnung-postgres-1"

cd "$APP_DIR"

# Pull bot token + alert chat id from the same .env / DB the app uses.
TOKEN="$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | head -1 | cut -d= -f2-)"
CHAT_ID="$(docker exec -i "$PG_CONTAINER" psql -U app -d suchewohnung -tAc \
  "select chat_id from telegram_subscriptions where enabled = true order by linked_at limit 1" 2>/dev/null | tr -d '[:space:]')"

# Count fresh kleinanzeigen listings in the window.
COUNT="$(docker exec -i "$PG_CONTAINER" psql -U app -d suchewohnung -tAc \
  "select count(*) from listings l join sources s on s.id = l.source_id
   where s.name ilike '%kleinanzeigen%'
     and l.first_seen_at > now() - interval '${WINDOW_MIN} minutes'" 2>/dev/null | tr -d '[:space:]')"
COUNT="${COUNT:-0}"

PREV="stub"
[ -f "$STATE_FILE" ] && PREV="$(cat "$STATE_FILE" 2>/dev/null || echo stub)"

send() {
  [ -n "$TOKEN" ] && [ -n "$CHAT_ID" ] || { echo "$(date -Is) no token/chat, skip alert"; return; }
  curl -s -m 20 -o /dev/null \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TOKEN}/sendMessage" || true
}

if [ "$COUNT" -eq 0 ]; then
  echo "$(date -Is) STALLED: 0 kleinanzeigen listings in last ${WINDOW_MIN}m"
  if [ "$PREV" != "stalled" ]; then
    send "⚠️ SucheWohnung: за последние ${WINDOW_MIN} мин НЕ пришло ни одного объявления с kleinanzeigen. Вероятно, прокси заблокирован — нужно заменить KLEINANZEIGEN_PROXY. Уведомления о новых квартирах сейчас не идут."
  fi
  echo "stalled" > "$STATE_FILE"
else
  echo "$(date -Is) OK: ${COUNT} kleinanzeigen listings in last ${WINDOW_MIN}m"
  if [ "$PREV" = "stalled" ]; then
    send "✅ SucheWohnung: источник kleinanzeigen снова отдаёт объявления (${COUNT} за ${WINDOW_MIN} мин). Уведомления восстановлены."
  fi
  echo "ok" > "$STATE_FILE"
fi
