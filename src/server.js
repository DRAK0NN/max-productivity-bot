// Главный файл сервера
// Express сервер для обработки webhook'ов от MAX

const express = require('express');
const { initDatabase } = require('./config/database');
const { handleMessage } = require('./handlers/messageHandler');
const { setWebhook, deleteWebhook } = require('./services/maxApi');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для парсинга JSON
app.use(express.json());

// Логирование всех запросов (для отладки)
// В продакшене лучше использовать winston или pino, но console.log тоже работает
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  // Можно добавить логирование body, но для безопасности лучше не логировать токены и т.д.
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook endpoint для получения событий от MAX
// По документации MAX: события приходят на указанный URL
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;

    console.log('📨 Получено событие от MAX:', JSON.stringify(event, null, 2));

    // Обработка callback от кнопок (если используется type: "callback")
    if (event.update_type === 'message_callback') {
      try {
        // Парсим payload из callback
        const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
        if (payload && payload.command) {
          // Симулируем сообщение с командой из payload
          const messageData = {
            user_id: event.user_id || event.message?.sender?.user_id,
            text: payload.command,
            recipient: event.message?.recipient,
            from: {
              id: event.user_id || event.message?.sender?.user_id
            }
          };
          await handleMessage(messageData);
          res.status(200).json({ ok: true });
          return;
        }
      } catch (error) {
        console.error('Ошибка обработки callback:', error);
      }
    }

    // По документации MAX API структура событий:
    // event.message.sender.user_id - ID отправителя
    // event.message.body.text - текст сообщения
    // event.message.recipient.user_id - ID бота (получателя)
    
    let messageData = null;
    
    if (event.message) {
      // Формат MAX API: преобразуем в наш формат
      const maxMessage = event.message;
      messageData = {
        user_id: maxMessage.sender?.user_id, // ID пользователя, который написал боту
        text: maxMessage.body?.text || '', // Текст сообщения
        from: {
          id: maxMessage.sender?.user_id,
          first_name: maxMessage.sender?.first_name,
          last_name: maxMessage.sender?.last_name
        },
        message_id: maxMessage.body?.mid,
        chat: {
          id: maxMessage.recipient?.chat_id
        },
        // Сохраняем recipient для отправки ответа (ВАЖНО!)
        recipient: maxMessage.recipient, // Это нужно для отправки ответа
        chat_id: maxMessage.recipient?.chat_id
      };
      
      // Убеждаемся, что recipient есть
      if (!messageData.recipient) {
        console.warn('⚠️ Recipient не найден в событии:', event);
      }
    } else if (event.type === 'message') {
      // Альтернативный формат
      messageData = event;
    } else if (event.text) {
      // Прямое сообщение
      messageData = event;
    }

    if (messageData && messageData.user_id) {
      await handleMessage(messageData);
    } else if (event.callback_query) {
      // Обработка нажатий на кнопки
      if (event.callback_query.message) {
        await handleMessage({
          ...event.callback_query.message,
          text: event.callback_query.data
        });
      }
    } else {
      console.log('⚠️ Неизвестный формат события или нет user_id:', event);
    }

    // Всегда отвечаем 200 OK, чтобы MAX не повторял запросы
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('❌ Ошибка обработки webhook:', error);
    // Все равно отвечаем 200, чтобы MAX не повторял запросы
    res.status(200).json({ ok: false, error: error.message });
  }
});

// Также обрабатываем GET запросы (для проверки webhook)
app.get('/webhook', (req, res) => {
  res.status(200).json({ status: 'webhook endpoint is active' });
});

// Endpoint для установки webhook (удобно для разработки)
app.post('/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = req.body.url || process.env.WEBHOOK_URL;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'Webhook URL не указан' });
    }

    console.log('🔧 Устанавливаю webhook:', webhookUrl);
    const result = await setWebhook(webhookUrl);
    console.log('✅ Webhook установлен:', result);
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Ошибка установки webhook:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data 
    });
  }
});

// Endpoint для проверки текущей подписки
app.get('/subscription', async (req, res) => {
  try {
    const { getSubscription } = require('./services/maxApi');
    const result = await getSubscription();
    res.json({ success: true, subscription: result });
  } catch (error) {
    console.error('Ошибка получения подписки:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint для удаления webhook
app.delete('/setup-webhook', async (req, res) => {
  try {
    const result = await deleteWebhook();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Ошибка удаления webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Запуск сервера
async function startServer() {
  try {
    // Инициализируем БД
    console.log('🔧 Инициализация базы данных...');
    await initDatabase();
    console.log('✅ База данных готова');

    // Запускаем сервер
    app.listen(PORT, () => {
      console.log(`🚀 Сервер запущен на порту ${PORT}`);
      console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
      console.log('\n💡 Для установки webhook используй:');
      console.log(`   POST http://localhost:${PORT}/setup-webhook`);
      console.log(`   Body: { "url": "https://your-domain.com/webhook" }`);
    });
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Запускаем сервер
startServer();

