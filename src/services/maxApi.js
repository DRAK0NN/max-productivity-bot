// Сервис для работы с MAX API
// Документация: https://dev.max.ru/docs

const axios = require('axios');
require('dotenv').config();

// Правильный URL для MAX API (по документации)
const MAX_API_URL = process.env.MAX_API_URL || 'https://platform-api.max.ru';
const BOT_TOKEN = process.env.MAX_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.warn('⚠️  MAX_BOT_TOKEN не установлен!');
}

// Создаем axios instance с базовыми настройками
// По документации MAX: токен передается через заголовок Authorization (без Bearer)
const https = require('https');
const maxApi = axios.create({
  baseURL: MAX_API_URL,
  headers: {
    'Authorization': BOT_TOKEN, // Токен передается напрямую, без Bearer
    'Content-Type': 'application/json'
  },
  timeout: 10000, // 10 секунд таймаут
  httpsAgent: new https.Agent({
    rejectUnauthorized: false // Для разработки, в продакшене лучше использовать правильные сертификаты
  })
});

/**
 * Отправка текстового сообщения пользователю
 * По документации MAX API
 * @param {string|number} userId - ID пользователя или chat_id в MAX
 * @param {string} text - Текст сообщения
 * @param {object} options - Дополнительные опции (recipient, body и т.д.)
 */
async function sendMessage(userId, text, options = {}) {
  // Объявляем payload в начале функции, чтобы он был доступен в catch блоке
  let payload;
  let url = '/messages';
  
  try {
    // ВАЖНО: MAX API требует получателя (chat_id или user_id) в QUERY-параметрах URL, а не в body!
    // Body должен содержать только text и attachments
    
    // Определяем получателя и формируем URL с query-параметром
    if (options.recipient && options.recipient.chat_id) {
      // Используем chat_id из события (предпочтительно для диалога)
      url = `/messages?chat_id=${options.recipient.chat_id}`;
    } else {
      // Иначе используем user_id (для нового чата или прямого сообщения)
      url = `/messages?user_id=${userId}`;
    }
    
    // Body - плоская структура с text и attachments
    payload = {
      text: text
    };
    
    // Преобразуем keyboard в формат attachments (если есть)
    if (options.keyboard && options.keyboard.buttons) {
      // Преобразуем формат кнопок в формат MAX API
      const buttons = options.keyboard.buttons.map(btn => {
        // Если кнопка уже в правильном формате, используем как есть
        if (btn.type && btn.text) {
          return btn;
        }
        // Иначе преобразуем из старого формата {text, action: {type, payload}}
        return {
          type: btn.action?.type === 'text' ? 'message' : (btn.action?.type || 'message'),
          text: btn.text,
          payload: btn.action?.payload || btn.text
        };
      });
      
      // Группируем кнопки в строки (по 2 кнопки в строке для лучшего вида)
      const buttonRows = [];
      for (let i = 0; i < buttons.length; i += 2) {
        buttonRows.push(buttons.slice(i, i + 2));
      }
      
      payload.attachments = [
        {
          type: 'inline_keyboard',
          payload: {
            buttons: buttonRows
          }
        }
      ];
    }
    
    // Опциональные параметры из options.body (если есть)
    if (options.body) {
      if (options.body.attachments) payload.attachments = options.body.attachments;
      if (options.body.link) payload.link = options.body.link;
      if (options.body.format) payload.format = options.body.format;
      if (options.body.notify !== undefined) payload.notify = options.body.notify;
      if (options.body.reply_to_message_id) payload.reply_to_message_id = options.body.reply_to_message_id;
    }

    // Отправляем запрос с query-параметрами в URL
    const response = await maxApi.post(url, payload);
    return response.data;
  } catch (error) {
    // Логируем детали ошибки для отладки
    if (error.response) {
      console.error('Ошибка отправки сообщения (MAX API):', {
        status: error.response.status,
        data: error.response.data,
        userId: userId,
        url: error.config?.url,
        payload: payload ? JSON.stringify(payload).substring(0, 200) : 'undefined'
      });
    } else {
      console.error('Ошибка отправки сообщения (сеть):', error.message);
    }
    throw error;
  }
}

/**
 * Отправка сообщения с кнопками
 * @param {string} userId - ID пользователя в MAX
 * @param {string} text - Текст сообщения
 * @param {Array} buttons - Массив кнопок [{text: "Текст", action: "action_name"}]
 * @param {object} options - Дополнительные опции (recipient и т.д.)
 */
async function sendMessageWithButtons(userId, text, buttons, options = {}) {
  return sendMessage(userId, text, {
    ...options,
    keyboard: {
      buttons: buttons.map(btn => ({
        text: btn.text,
        action: {
          type: btn.action?.type || 'text',
          payload: btn.action || btn.action
        }
      }))
    }
  });
}

/**
 * Получение информации о пользователе
 * @param {string} userId - ID пользователя в MAX
 */
async function getUserInfo(userId) {
  try {
    const response = await maxApi.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Ошибка получения информации о пользователе:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Установка webhook для получения событий
 * По документации MAX: используется endpoint /subscriptions
 * @param {string} webhookUrl - URL для webhook (только HTTPS)
 */
async function setWebhook(webhookUrl) {
  try {
    // Проверяем, что URL использует HTTPS (требование MAX)
    if (!webhookUrl.startsWith('https://')) {
      throw new Error('Webhook URL должен использовать HTTPS протокол');
    }

    // По документации MAX: POST /subscriptions с URL
    // Пробуем разные варианты endpoints
    let response;
    try {
      response = await maxApi.post('/subscriptions', {
        url: webhookUrl
      });
    } catch (e) {
      // Если не сработало, пробуем с версией API
      try {
        response = await maxApi.post('/v1/subscriptions', {
          url: webhookUrl
        });
      } catch (e2) {
        throw e2;
      }
    }
    return response.data;
  } catch (error) {
    console.error('Ошибка установки webhook:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Получение информации о текущей подписке (webhook)
 */
async function getSubscription() {
  try {
    const response = await maxApi.get('/subscriptions');
    return response.data;
  } catch (error) {
    console.error('Ошибка получения подписки:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Удаление webhook (отписка)
 */
async function deleteWebhook() {
  try {
    const response = await maxApi.delete('/subscriptions');
    return response.data;
  } catch (error) {
    console.error('Ошибка удаления webhook:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendMessage,
  sendMessageWithButtons,
  getUserInfo,
  setWebhook,
  getSubscription,
  deleteWebhook
};

