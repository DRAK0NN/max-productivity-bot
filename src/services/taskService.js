// Сервис для работы с задачами
// CRUD операции для задач пользователя

const { getPool } = require('../config/database');
const { addXP } = require('./userService');

/**
 * Создание новой задачи
 * @param {number} userId - ID пользователя в БД
 * @param {object} taskData - Данные задачи
 */
async function createTask(userId, taskData) {
  const db = getPool();
  
  try {
    const result = await db.query(
      `INSERT INTO tasks (user_id, title, description, priority, due_date, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [
        userId,
        taskData.title,
        taskData.description || null,
        taskData.priority || 'medium',
        taskData.due_date || null
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка создания задачи:', error);
    throw error;
  }
}

/**
 * Получение всех задач пользователя
 * @param {number} userId - ID пользователя в БД
 * @param {string} status - Фильтр по статусу (optional)
 */
async function getUserTasks(userId, status = null) {
  const db = getPool();
  
  try {
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Ошибка получения задач:', error);
    throw error;
  }
}

/**
 * Завершение задачи
 * @param {number} taskId - ID задачи
 * @param {number} userId - ID пользователя (для проверки прав)
 */
async function completeTask(taskId, userId) {
  const db = getPool();
  
  try {
    // Проверяем, что задача принадлежит пользователю
    const task = await db.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [taskId, userId]);
    if (task.rows.length === 0) {
      throw new Error('Задача не найдена или не принадлежит пользователю');
    }

    if (task.rows[0].status === 'completed') {
      return { message: 'Задача уже завершена', task: task.rows[0] };
    }

    // Обновляем статус
    const result = await db.query(
      `UPDATE tasks 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [taskId, userId]
    );

    // Начисляем XP за выполнение задачи
    await addXP(userId, 10); // 10 XP за задачу

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка завершения задачи:', error);
    throw error;
  }
}

/**
 * Удаление задачи
 * @param {number} taskId - ID задачи
 * @param {number} userId - ID пользователя
 */
async function deleteTask(taskId, userId) {
  const db = getPool();
  
  try {
    const result = await db.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *',
      [taskId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Задача не найдена');
    }

    return result.rows[0];
  } catch (error) {
    console.error('Ошибка удаления задачи:', error);
    throw error;
  }
}

module.exports = {
  createTask,
  getUserTasks,
  completeTask,
  deleteTask
};

