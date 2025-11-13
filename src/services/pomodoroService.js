// Сервис для работы с Pomodoro таймером
// 25 минут работы, 5 минут перерыва - классика жанра

const { getPool } = require('../config/database');
const { addXP } = require('./userService');

// Хранилище активных таймеров
// В продакшене лучше Redis, но для MVP сойдет и Map
// TODO: переделать на Redis когда будет время (или не будет, кто знает)
const activeTimers = new Map();

/**
 * Запуск Pomodoro сессии
 * @param {number} userId - ID пользователя в БД
 * @param {number} taskId - ID задачи (опционально)
 * @param {number} duration - Длительность в минутах (по умолчанию 25)
 */
async function startPomodoro(userId, taskId = null, duration = 25) {
  const db = getPool();
  
  try {
    // Проверяем, нет ли уже активной сессии
    if (activeTimers.has(userId)) {
      return { error: 'У вас уже есть активная Pomodoro сессия!' };
    }

    // Создаем запись в БД
    // task_id опционален - если не передан, используем NULL
    const result = await db.query(
      `INSERT INTO pomodoro_sessions (user_id, task_id, duration, completed, started_at)
       VALUES ($1, $2, $3, false, CURRENT_TIMESTAMP)
       RETURNING *`,
      [userId, taskId || null, duration]
    );

    const session = result.rows[0];

    // Устанавливаем таймер
    // В реальном проекте лучше использовать cron или очереди (RabbitMQ, Bull и т.д.)
    // Но для хакатона setTimeout сойдет, работает же!
    const timerId = setTimeout(async () => {
      await completePomodoro(session.id, userId);
      activeTimers.delete(userId);
    }, duration * 60 * 1000); // Конвертируем минуты в миллисекунды (25 * 60 * 1000 = 1.5M мс)

    activeTimers.set(userId, {
      sessionId: session.id,
      timerId: timerId,
      endTime: Date.now() + (duration * 60 * 1000)
    });

    return session;
  } catch (error) {
    console.error('Ошибка запуска Pomodoro:', error);
    throw error;
  }
}

/**
 * Завершение Pomodoro сессии
 * @param {number} sessionId - ID сессии
 * @param {number} userId - ID пользователя
 */
async function completePomodoro(sessionId, userId) {
  const db = getPool();
  
  try {
    const result = await db.query(
      `UPDATE pomodoro_sessions 
       SET completed = true, completed_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [sessionId, userId]
    );

    if (result.rows.length > 0) {
      // Начисляем XP за завершенную сессию
      await addXP(userId, 15); // 15 XP за Pomodoro
    }

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка завершения Pomodoro:', error);
    throw error;
  }
}

/**
 * Остановка активной Pomodoro сессии
 * @param {number} userId - ID пользователя
 */
async function stopPomodoro(userId) {
  try {
    const timer = activeTimers.get(userId);
    if (!timer) {
      return { error: 'У вас нет активной Pomodoro сессии' };
    }

    clearTimeout(timer.timerId);
    activeTimers.delete(userId);

    // Помечаем сессию как не завершенную
    const db = getPool();
    await db.query(
      'UPDATE pomodoro_sessions SET completed = false WHERE id = $1',
      [timer.sessionId]
    );

    return { message: 'Pomodoro сессия остановлена' };
  } catch (error) {
    console.error('Ошибка остановки Pomodoro:', error);
    throw error;
  }
}

/**
 * Получение статуса активной сессии
 * @param {number} userId - ID пользователя
 */
function getActivePomodoro(userId) {
  const timer = activeTimers.get(userId);
  if (!timer) {
    return null;
  }

  const remaining = Math.max(0, timer.endTime - Date.now());
  const remainingMinutes = Math.floor(remaining / 60000);
  const remainingSeconds = Math.floor((remaining % 60000) / 1000);

  return {
    sessionId: timer.sessionId,
    remaining: remaining,
    remainingMinutes: remainingMinutes,
    remainingSeconds: remainingSeconds,
    formatted: `${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`
  };
}

/**
 * Получение статистики Pomodoro
 * @param {number} userId - ID пользователя
 */
async function getPomodoroStats(userId) {
  const db = getPool();
  
  try {
    const stats = await db.query(
      `SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_sessions,
        SUM(duration) FILTER (WHERE completed_at IS NOT NULL) as total_minutes,
        MAX(completed_at) as last_session
       FROM pomodoro_sessions 
       WHERE user_id = $1`,
      [userId]
    );

    return stats.rows[0];
  } catch (error) {
    console.error('Ошибка получения статистики Pomodoro:', error);
    throw error;
  }
}

module.exports = {
  startPomodoro,
  completePomodoro,
  stopPomodoro,
  getActivePomodoro,
  getPomodoroStats
};

