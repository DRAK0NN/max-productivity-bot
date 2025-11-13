// Вспомогательные функции
// Разные утилиты, которые могут пригодиться

/**
 * Форматирование даты в читаемый вид
 * @param {Date|string} date - Дата
 * @param {string} locale - Локаль (по умолчанию ru-RU)
 */
function formatDate(date, locale = 'ru-RU') {
  if (!date) return 'не указано';
  
  const d = new Date(date);
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Форматирование времени из минут в "X часов Y минут"
 * @param {number} minutes - Количество минут
 */
function formatMinutes(minutes) {
  if (!minutes || minutes === 0) return '0 минут';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins} ${mins === 1 ? 'минута' : mins < 5 ? 'минуты' : 'минут'}`;
  }
  
  if (mins === 0) {
    return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}`;
  }
  
  return `${hours} ${hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'} ${mins} ${mins === 1 ? 'минута' : mins < 5 ? 'минуты' : 'минут'}`;
}

/**
 * Валидация email (на всякий случай, если понадобится)
 * @param {string} email - Email адрес
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Генерация случайного ID (если понадобится)
 * @param {number} length - Длина ID
 */
function generateId(length = 8) {
  return Math.random().toString(36).substring(2, length + 2);
}

/**
 * Задержка (для тестирования или rate limiting)
 * @param {number} ms - Миллисекунды
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  formatDate,
  formatMinutes,
  isValidEmail,
  generateId,
  sleep
};

