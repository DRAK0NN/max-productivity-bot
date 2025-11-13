#!/bin/bash
# Скрипт для быстрой установки webhook
# Использование: ./scripts/setup-webhook.sh https://your-domain.com/webhook

if [ -z "$1" ]; then
    echo "❌ Укажи URL webhook"
    echo "Использование: ./scripts/setup-webhook.sh https://your-domain.com/webhook"
    exit 1
fi

WEBHOOK_URL=$1
SERVER_URL=${SERVER_URL:-http://localhost:3000}

echo "🔧 Устанавливаю webhook: $WEBHOOK_URL"

curl -X POST "$SERVER_URL/setup-webhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\"}"

echo ""
echo "✅ Готово! Проверь логи бота"

