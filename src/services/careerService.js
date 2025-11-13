// Сервис для работы с карьерными целями
// Помощь в планировании карьеры и достижении целей

const { getPool } = require('../config/database');
const { addXP } = require('./userService');

/**
 * Создание карьерной цели
 * @param {number} userId - ID пользователя в БД
 * @param {object} goalData - Данные цели
 */
async function createCareerGoal(userId, goalData) {
  const db = getPool();
  
  try {
    const result = await db.query(
      `INSERT INTO career_goals (user_id, title, description, target_date, progress, status)
       VALUES ($1, $2, $3, $4, 0, 'active')
       RETURNING *`,
      [
        userId,
        goalData.title,
        goalData.description || null,
        goalData.target_date || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка создания карьерной цели:', error);
    throw error;
  }
}

/**
 * Получение всех карьерных целей пользователя
 * @param {number} userId - ID пользователя в БД
 * @param {string} status - Фильтр по статусу (optional)
 */
async function getUserCareerGoals(userId, status = null) {
  const db = getPool();
  
  try {
    let query = 'SELECT * FROM career_goals WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения карьерных целей:', error);
    throw error;
  }
}

/**
 * Обновление прогресса цели
 * @param {number} goalId - ID цели
 * @param {number} userId - ID пользователя
 * @param {number} progress - Новый прогресс (0-100)
 */
async function updateGoalProgress(goalId, userId, progress) {
  const db = getPool();
  
  try {
    // Проверяем права
    const goal = await db.query('SELECT * FROM career_goals WHERE id = $1 AND user_id = $2', [goalId, userId]);
    if (goal.rows.length === 0) {
      throw new Error('Цель не найдена');
    }

    const clampedProgress = Math.max(0, Math.min(100, progress)); // Ограничиваем 0-100

    const result = await db.query(
      `UPDATE career_goals 
       SET progress = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [clampedProgress, goalId, userId]
    );

    // Если прогресс достиг 100%, начисляем бонусные XP
    if (clampedProgress === 100 && goal.rows[0].progress < 100) {
      await addXP(userId, 50); // 50 XP за достижение цели
    }

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка обновления прогресса:', error);
    throw error;
  }
}

/**
 * Завершение цели
 * @param {number} goalId - ID цели
 * @param {number} userId - ID пользователя
 */
async function completeGoal(goalId, userId) {
  const db = getPool();
  
  try {
    const result = await db.query(
      `UPDATE career_goals 
       SET status = 'completed', progress = 100, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [goalId, userId]
    );

    if (result.rows.length > 0) {
      await addXP(userId, 50);
    }

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка завершения цели:', error);
    throw error;
  }
}

/**
 * Получение рекомендаций на основе целей
 * @param {number} userId - ID пользователя
 */
async function getCareerRecommendations(userId) {
  const db = getPool();
  
  try {
    const goals = await getUserCareerGoals(userId, 'active');
    
    // Простые рекомендации на основе целей
    // В реальном проекте тут мог бы быть AI (GPT, Claude и т.д.) или более сложная логика
    // Но для хакатона простые правила тоже работают, не переусложняем
    const recommendations = [];

    goals.forEach(goal => {
      if (goal.progress < 30) {
        recommendations.push({
          type: 'start',
          message: `Начни работать над целью "${goal.title}". Разбей её на маленькие шаги!`,
          goal: goal
        });
      } else if (goal.progress >= 30 && goal.progress < 70) {
        recommendations.push({
          type: 'continue',
          message: `Отличный прогресс по цели "${goal.title}"! Продолжай в том же духе!`,
          goal: goal
        });
      } else if (goal.progress >= 70) {
        recommendations.push({
          type: 'finish',
          message: `Ты почти у цели "${goal.title}"! Осталось совсем немного!`,
          goal: goal
        });
      }
    });

    return recommendations;
  } catch (error) {
    console.error('Ошибка получения рекомендаций:', error);
    throw error;
  }
}

module.exports = {
  createCareerGoal,
  getUserCareerGoals,
  updateGoalProgress,
  completeGoal,
  getCareerRecommendations
};

