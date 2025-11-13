// Сервис для работы с пользователями
// Тут вся логика по пользователям, XP, уровням и т.д.

const { getPool } = require('../config/database');
const { getUserInfo } = require('./maxApi');

/**
 * Регистрация или получение пользователя
 * @param {string} maxUserId - ID пользователя в MAX
 * @param {object} userData - Данные пользователя из MAX API
 */
async function getOrCreateUser(maxUserId, userData = null) {
  const db = getPool();
  
  try {
    // Пытаемся найти существующего пользователя
    let result = await db.query(
      'SELECT * FROM users WHERE max_user_id = $1',
      [maxUserId]
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Если пользователя нет, создаем нового
    // Если userData не передан, пытаемся получить из MAX API
    if (!userData) {
      try {
        userData = await getUserInfo(maxUserId);
      } catch (error) {
        console.warn('Не удалось получить данные пользователя из MAX API, используем дефолтные');
        userData = {};
      }
    }

    // Схема БД не содержит first_name и last_name, используем только username
    const newUser = await db.query(
      `INSERT INTO users (max_user_id, username, xp, level)
       VALUES ($1, $2, 0, 1)
       RETURNING *`,
      [
        maxUserId,
        userData.username || userData.user_name || userData.name || null
      ]
    );

    return newUser.rows[0];
  } catch (error) {
    console.error('Ошибка работы с пользователем:', error);
    throw error;
  }
}

/**
 * Добавление XP пользователю
 * @param {number} userId - ID пользователя в БД
 * @param {number} xpAmount - Количество XP
 */
async function addXP(userId, xpAmount) {
  const db = getPool();
  
  try {
    // Получаем текущие XP и уровень
    const user = await db.query('SELECT xp, level FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      throw new Error('Пользователь не найден');
    }

    const currentXP = user.rows[0].xp;
    const currentLevel = user.rows[0].level;
    const newXP = currentXP + xpAmount;

    // Формула уровня: каждые 100 XP = 1 уровень
    // Можно сделать сложнее (экспоненциальный рост), но для MVP линейная формула норм
    // В будущем можно добавить бонусы за streak'и и т.д.
    const newLevel = Math.floor(newXP / 100) + 1;
    const leveledUp = newLevel > currentLevel; // Проверяем, повысился ли уровень

    // Обновляем XP и уровень
    await db.query(
      'UPDATE users SET xp = $1, level = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newXP, newLevel, userId]
    );

    return {
      newXP,
      newLevel,
      leveledUp,
      xpGained: xpAmount
    };
  } catch (error) {
    console.error('Ошибка добавления XP:', error);
    throw error;
  }
}

/**
 * Получение статистики пользователя
 * @param {number} userId - ID пользователя в БД
 */
async function getUserStats(userId) {
  const db = getPool();
  
  try {
    const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      throw new Error('Пользователь не найден');
    }

    // Статистика задач
    const tasksStats = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending
       FROM tasks WHERE user_id = $1`,
      [userId]
    );

    // Статистика Pomodoro
    // Используем completed_at IS NOT NULL вместо completed = true
    const pomodoroStats = await db.query(
      `SELECT 
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed_sessions,
        SUM(duration) FILTER (WHERE completed_at IS NOT NULL) as total_minutes
       FROM pomodoro_sessions WHERE user_id = $1`,
      [userId]
    );

    // Статистика привычек
    const habitsStats = await db.query(
      `SELECT 
        COUNT(*) as total_habits,
        SUM(streak) as total_streak,
        MAX(best_streak) as best_streak
       FROM habits WHERE user_id = $1 AND active = true`,
      [userId]
    );

    return {
      user: user.rows[0],
      tasks: tasksStats.rows[0],
      pomodoro: pomodoroStats.rows[0],
      habits: habitsStats.rows[0]
    };
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    throw error;
  }
}

module.exports = {
  getOrCreateUser,
  addXP,
  getUserStats
};

