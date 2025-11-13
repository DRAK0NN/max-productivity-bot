// Сервис для работы с привычками
// Трекинг ежедневных привычек со streak'ами и напоминаниями

const { getPool } = require('../config/database');
const { addXP } = require('./userService');
const cron = require('node-cron');

/**
 * Создание новой привычки
 * @param {number} userId - ID пользователя в БД
 * @param {object} habitData - Данные привычки
 */
async function createHabit(userId, habitData) {
  const db = getPool();
  
  try {
    const result = await db.query(
      `INSERT INTO habits (user_id, name, description, reminder_time, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [
        userId,
        habitData.name,
        habitData.description || null,
        habitData.reminder_time || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка создания привычки:', error);
    throw error;
  }
}

/**
 * Получение всех привычек пользователя
 * @param {number} userId - ID пользователя в БД
 * @param {boolean} activeOnly - Только активные привычки
 */
async function getUserHabits(userId, activeOnly = true) {
  const db = getPool();
  
  try {
    let query = 'SELECT * FROM habits WHERE user_id = $1';
    const params = [userId];

    if (activeOnly) {
      query += ' AND active = true';
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения привычек:', error);
    throw error;
  }
}

/**
 * Отметка привычки как выполненной на сегодня
 * @param {number|string} habitIdOrName - ID привычки (number) или название (string)
 * @param {number} userId - ID пользователя
 */
async function markHabitComplete(habitIdOrName, userId) {
  const db = getPool();
  
  try {
    // Парсим аргумент: если число - это ID, иначе ищем по названию
    let habitId;
    let habit;
    
    if (!habitIdOrName) {
      throw new Error('Укажи ID или название привычки');
    }
    
    // Пробуем распарсить как число
    const parsedId = parseInt(habitIdOrName);
    if (!isNaN(parsedId) && parsedId.toString() === habitIdOrName.toString().trim()) {
      // Это ID (число)
      habitId = parsedId;
      const result = await db.query('SELECT * FROM habits WHERE id = $1 AND user_id = $2', [habitId, userId]);
      if (result.rows.length === 0) {
        throw new Error('Привычка не найдена');
      }
      habit = result.rows[0];
    } else {
      // Это название (строка) - ищем по name
      const name = habitIdOrName.toString().trim();
      const result = await db.query('SELECT * FROM habits WHERE name = $1 AND user_id = $2', [name, userId]);
      if (result.rows.length === 0) {
        throw new Error('Привычка не найдена');
      }
      habit = result.rows[0];
      habitId = habit.id; // Теперь habitId - всегда integer
    }
    
    // Логируем для отладки
    console.log('Mark arg:', habitIdOrName, 'Found habitId:', habitId, 'Habit name:', habit.name);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Проверяем, не отмечена ли уже сегодня
    const existing = await db.query(
      'SELECT * FROM habit_tracking WHERE habit_id = $1 AND date = $2',
      [habitId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].completed) {
      return { 
        message: 'Привычка уже отмечена на сегодня!', 
        habit: habit,
        streak: habit.streak || 0
      };
    }

    // Создаем или обновляем запись
    await db.query(
      `INSERT INTO habit_tracking (habit_id, user_id, date, completed)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (habit_id, date) 
       DO UPDATE SET completed = true`,
      [habitId, userId, today]
    );

    // Обновляем streak (передаем integer habitId)
    const newStreak = await updateHabitStreak(habitId, userId);

    // Начисляем XP за выполнение привычки
    await addXP(userId, 5); // 5 XP за привычку

    // Обновляем habit из БД, чтобы получить актуальный streak
    const updatedHabit = await db.query('SELECT * FROM habits WHERE id = $1', [habitId]);
    
    return {
      habit: updatedHabit.rows[0] || habit,
      streak: newStreak
    };
  } catch (error) {
    console.error('Ошибка отметки привычки:', error);
    throw error;
  }
}

/**
 * Обновление streak для привычки
 * @param {number} habitId - ID привычки (всегда integer)
 * @param {number} userId - ID пользователя
 */
async function updateHabitStreak(habitId, userId) {
  const db = getPool();
  
  try {
    // Убеждаемся, что habitId - integer
    const habitIdInt = parseInt(habitId);
    if (isNaN(habitIdInt)) {
      throw new Error('Invalid habitId: must be integer');
    }
    
    // Получаем все записи трекинга, отсортированные по дате
    const tracking = await db.query(
      `SELECT date, completed 
       FROM habit_tracking 
       WHERE habit_id = $1 AND user_id = $2
       ORDER BY date DESC`,
      [habitIdInt, userId]
    );

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Считаем streak с сегодняшнего дня назад
    for (let i = 0; i < tracking.rows.length; i++) {
      const record = tracking.rows[i];
      if (!record.completed) {
        break; // Прерываем streak если пропущен день
      }
      
      const recordDate = new Date(record.date);
      recordDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor((today - recordDate) / (1000 * 60 * 60 * 24));

      if (daysDiff === i) {
        streak++;
      } else {
        break; // Прерываем если есть пропуск в днях
      }
    }

    // Обновляем streak в БД (используем integer habitId)
    const habit = await db.query('SELECT best_streak FROM habits WHERE id = $1 AND user_id = $2', [habitIdInt, userId]);
    if (habit.rows.length === 0) {
      throw new Error('Привычка не найдена при обновлении streak');
    }
    
    const bestStreak = habit.rows[0]?.best_streak || 0;

    await db.query(
      `UPDATE habits 
       SET streak = $1, best_streak = GREATEST($1, COALESCE($2, 0)) 
       WHERE id = $3 AND user_id = $4`,
      [streak, bestStreak, habitIdInt, userId]
    );

    return streak;
  } catch (error) {
    console.error('Ошибка обновления streak:', error);
    throw error;
  }
}

/**
 * Получение статистики привычек
 * @param {number} userId - ID пользователя
 */
async function getHabitsStats(userId) {
  const db = getPool();
  
  try {
    const stats = await db.query(
      `SELECT 
        COUNT(*) as total_habits,
        SUM(streak) as total_streak,
        MAX(best_streak) as best_streak,
        COUNT(*) FILTER (WHERE active = true) as active_habits
       FROM habits 
       WHERE user_id = $1`,
      [userId]
    );

    // Статистика за последние 7 дней
    const weekStats = await db.query(
      `SELECT 
        COUNT(*) as completed_days
       FROM habit_tracking 
       WHERE user_id = $1 
       AND date >= CURRENT_DATE - INTERVAL '7 days'
       AND completed = true`,
      [userId]
    );

    return {
      ...stats.rows[0],
      week_completed: weekStats.rows[0]?.completed_days || 0
    };
  } catch (error) {
    console.error('Ошибка получения статистики привычек:', error);
    throw error;
  }
}

/**
 * Удаление привычки
 * @param {number} habitId - ID привычки
 * @param {number} userId - ID пользователя
 */
async function deleteHabit(habitId, userId) {
  const db = getPool();
  
  try {
    const result = await db.query(
      'UPDATE habits SET active = false WHERE id = $1 AND user_id = $2 RETURNING *',
      [habitId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Привычка не найдена');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка удаления привычки:', error);
    throw error;
  }
}

module.exports = {
  createHabit,
  getUserHabits,
  markHabitComplete,
  updateHabitStreak,
  getHabitsStats,
  deleteHabit
};


