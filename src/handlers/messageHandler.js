// Обработчик сообщений от пользователей
// Тут вся логика парсинга команд и ответов
// В общем, тут происходит магия - получаем сообщение, парсим, отвечаем

const { sendMessage, sendMessageWithButtons } = require('../services/maxApi');
const { getOrCreateUser, getUserStats } = require('../services/userService');
const { createTask, getUserTasks, completeTask, deleteTask } = require('../services/taskService');
const { startPomodoro, stopPomodoro, getActivePomodoro, getPomodoroStats } = require('../services/pomodoroService');
const { createHabit, getUserHabits, markHabitComplete, getHabitsStats } = require('../services/habitService');
const { createCareerGoal, getUserCareerGoals, updateGoalProgress, getCareerRecommendations } = require('../services/careerService');

/**
 * Главный обработчик входящих сообщений
 * @param {object} message - Сообщение от MAX API
 */
async function handleMessage(message) {
  // Парсим сообщение - достаем user_id и текст
  // MAX API может присылать по-разному, поэтому проверяем оба варианта
  const userId = message.user_id || message.from?.id;
  const text = message.text || '';
  const command = text.toLowerCase().trim(); // Приводим к нижнему регистру для удобства
  const recipient = message.recipient; // Сохраняем recipient для отправки ответа

  if (!userId) {
    // Если нет user_id - это странно, но не падаем, просто логируем
    console.warn('Сообщение без user_id, что-то не так:', message);
    return;
  }

  try {
    // Регистрируем или получаем пользователя
    // Если первый раз - создаем запись в БД, если уже есть - просто берем
    const user = await getOrCreateUser(userId);

    // Создаем опции для отправки сообщений (с recipient)
    const sendOptions = recipient ? { recipient } : {};

    // Обработка текстов кнопок (быстрый фикс для кнопок клавиатуры)
    // Кнопки отправляют свой текст как сообщение, поэтому обрабатываем их как команды
    if (text === '📝 Задачи') {
      await handleTasks(userId, user.id, sendOptions);
      return;
    } else if (text === '🍅 Pomodoro') {
      await handlePomodoro(userId, user.id, text, sendOptions);
      return;
    } else if (text === '✅ Привычки') {
      await handleHabits(userId, user.id, sendOptions);
      return;
    } else if (text === '📊 Статистика') {
      await handleStats(userId, user.id, sendOptions);
      return;
    }

    // Обработка команд
    if (command.startsWith('/start') || command.startsWith('/help') || command === 'начать' || command === 'помощь') {
      await handleStart(userId, user, message, sendOptions);
    } else if (command.startsWith('/tasks') || command === 'задачи') {
      await handleTasks(userId, user.id, sendOptions);
    } else if (command.startsWith('/task ')) {
      await handleCreateTask(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/complete ')) {
      await handleCompleteTask(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/pomodoro') || command === 'помидор') {
      await handlePomodoro(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/habits') || command === 'привычки') {
      await handleHabits(userId, user.id, sendOptions);
    } else if (command.startsWith('/habit ')) {
      await handleCreateHabit(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/mark ')) {
      await handleMarkHabit(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/career') || command === 'карьера') {
      await handleCareer(userId, user.id, sendOptions);
    } else if (command.startsWith('/goal ')) {
      await handleCreateGoal(userId, user.id, text, sendOptions);
    } else if (command.startsWith('/stats') || command === 'статистика') {
      await handleStats(userId, user.id, sendOptions);
    } else if (command.startsWith('/progress') || command === 'прогресс') {
      await handleProgress(userId, user.id, sendOptions);
    } else {
      // Неизвестная команда - показываем помощь
      // В будущем тут можно добавить NLP для понимания намерений, но пока так
      await sendMessage(userId, 
        '🤔 Не понял команду. Используй /help для списка команд или /start для начала работы.',
        sendOptions
      );
    }
  } catch (error) {
    // Ловим все ошибки, чтобы бот не падал
    // В продакшене тут бы был Sentry или подобный сервис
    console.error('Ошибка обработки сообщения (что-то пошло не так):', error);
    // В случае ошибки тоже передаем recipient, если есть
    const errorOptions = message.recipient ? { recipient: message.recipient } : {};
    await sendMessage(userId, 
      '😅 Произошла ошибка. Попробуй еще раз или напиши /help для помощи.',
      errorOptions
    );
  }
}

/**
 * Обработка команды /start
 */
async function handleStart(userId, user, messageData = null, sendOptions = {}) {
  const welcomeText = `
🎯 Привет! Я ProdMax - твой помощник по продуктивности!

✨ Что я умею:
• 📝 Управление задачами
• 🍅 Pomodoro таймер
• ✅ Трекер привычек
• 🚀 Карьерные цели
• 📊 Статистика и прогресс

💡 Команды:
/start или /help - это меню
/tasks - список задач
/task [название] - создать задачу
/pomodoro - запустить таймер
/habits - мои привычки
/habit [название] - добавить привычку
/career - карьерные цели
/stats - статистика

🔥 Твой уровень: ${user.level} | XP: ${user.xp}

Начни с создания первой задачи: /task Изучить MAX API
  `.trim();

  const buttons = [
    { text: '📝 Задачи', action: '/tasks' },
    { text: '🍅 Pomodoro', action: '/pomodoro' },
    { text: '✅ Привычки', action: '/habits' },
    { text: '📊 Статистика', action: '/stats' }
  ];

  // Используем переданные опции (с recipient)
  await sendMessageWithButtons(userId, welcomeText, buttons, sendOptions);
}

/**
 * Обработка задач
 */
async function handleTasks(userId, dbUserId, sendOptions = {}) {
  const tasks = await getUserTasks(dbUserId);
  
  if (tasks.length === 0) {
    await sendMessage(userId, '📝 У тебя пока нет задач. Создай первую: /task [название]', sendOptions);
    return;
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  let text = '📝 Твои задачи:\n\n';
  
  if (pendingTasks.length > 0) {
    text += '⏳ В работе:\n';
    pendingTasks.slice(0, 10).forEach((task, idx) => {
      text += `${idx + 1}. ${task.title}`;
      if (task.priority === 'high') text += ' 🔥';
      if (task.due_date) text += ` (до ${new Date(task.due_date).toLocaleDateString('ru-RU')})`;
      text += `\n   /complete ${task.id}\n`;
    });
  }

  if (completedTasks.length > 0) {
    text += `\n✅ Выполнено: ${completedTasks.length} задач`;
  }

  text += '\n\n💡 Создать задачу: /task [название]';

  await sendMessage(userId, text, sendOptions);
}

/**
 * Создание задачи
 */
async function handleCreateTask(userId, dbUserId, text, sendOptions = {}) {
  const taskText = text.replace('/task', '').trim();
  
  if (!taskText) {
    await sendMessage(userId, '❌ Укажи название задачи: /task [название]', sendOptions);
    return;
  }

  const task = await createTask(dbUserId, { title: taskText });
  await sendMessage(userId, `✅ Задача создана!\n\n"${task.title}"\n\nИспользуй /complete ${task.id} чтобы завершить её`, sendOptions);
}

/**
 * Завершение задачи
 */
async function handleCompleteTask(userId, dbUserId, text, sendOptions = {}) {
  const taskId = parseInt(text.replace('/complete', '').trim());
  
  if (!taskId || isNaN(taskId)) {
    await sendMessage(userId, '❌ Укажи ID задачи: /complete [id]', sendOptions);
    return;
  }

  try {
    const task = await completeTask(taskId, dbUserId);
    await sendMessage(userId, `🎉 Задача "${task.title}" выполнена!\n\n+10 XP за выполнение!`, sendOptions);
  } catch (error) {
    await sendMessage(userId, '❌ Задача не найдена', sendOptions);
  }
}

/**
 * Обработка Pomodoro
 */
async function handlePomodoro(userId, dbUserId, text, sendOptions = {}) {
  const command = text.toLowerCase().trim();
  
  if (command === '/pomodoro' || command === '/pomodoro start' || command === 'помидор') {
    // Проверяем активную сессию
    const active = getActivePomodoro(dbUserId);
    if (active) {
      await sendMessage(userId, 
        `⏱️ У тебя уже есть активная Pomodoro сессия!\n\nОсталось: ${active.formatted}\n\nИспользуй /pomodoro stop чтобы остановить`,
        sendOptions
      );
      return;
    }

    const session = await startPomodoro(dbUserId);
    if (session.error) {
      await sendMessage(userId, session.error, sendOptions);
      return;
    }

    await sendMessage(userId, 
      `🍅 Pomodoro запущен! 25 минут фокуса.\n\nИспользуй /pomodoro status чтобы проверить время\n/pomodoro stop чтобы остановить`,
      sendOptions
    );
  } else if (command === '/pomodoro stop') {
    const result = await stopPomodoro(dbUserId);
    await sendMessage(userId, result.error || '⏹️ Pomodoro остановлен', sendOptions);
  } else if (command === '/pomodoro status') {
    const active = getActivePomodoro(dbUserId);
    if (active) {
      await sendMessage(userId, `⏱️ Осталось: ${active.formatted}`, sendOptions);
    } else {
      await sendMessage(userId, '❌ Нет активной Pomodoro сессии', sendOptions);
    }
  } else if (command === '/pomodoro stats') {
    const stats = await getPomodoroStats(dbUserId);
    await sendMessage(userId, 
      `📊 Статистика Pomodoro:\n\n` +
      `Всего сессий: ${stats.total_sessions || 0}\n` +
      `Завершено: ${stats.completed_sessions || 0}\n` +
      `Всего минут: ${stats.total_minutes || 0}`,
      sendOptions
    );
  } else {
    await sendMessage(userId, 
      '🍅 Pomodoro команды:\n' +
      '/pomodoro - запустить таймер\n' +
      '/pomodoro stop - остановить\n' +
      '/pomodoro status - проверить время\n' +
      '/pomodoro stats - статистика',
      sendOptions
    );
  }
}

/**
 * Обработка привычек
 */
async function handleHabits(userId, dbUserId, sendOptions = {}) {
  const habits = await getUserHabits(dbUserId);
  
  if (habits.length === 0) {
    await sendMessage(userId, '✅ У тебя пока нет привычек. Создай первую: /habit [название]', sendOptions);
    return;
  }

  let text = '✅ Твои привычки:\n\n';
  habits.forEach((habit, idx) => {
    text += `${idx + 1}. ${habit.name} (ID: ${habit.id}) 🔥${habit.streak || 0} (лучший: ${habit.best_streak || 0})\n`;
    text += `   /mark ${habit.id} или /mark ${habit.name}\n\n`;
  });

  text += '💡 Добавить привычку: /habit [название]';

  await sendMessage(userId, text, sendOptions);
}

/**
 * Создание привычки
 */
async function handleCreateHabit(userId, dbUserId, text, sendOptions = {}) {
  const habitText = text.replace('/habit', '').trim();
  
  if (!habitText) {
    await sendMessage(userId, '❌ Укажи название привычки: /habit [название]', sendOptions);
    return;
  }

  const habit = await createHabit(dbUserId, { name: habitText });
  await sendMessage(userId, `✅ Привычка "${habit.name}" добавлена!\n\nИспользуй /mark ${habit.id} чтобы отметить выполнение`, sendOptions);
}

/**
 * Отметка привычки
 */
async function handleMarkHabit(userId, dbUserId, text, sendOptions = {}) {
  // Извлекаем аргумент (ID или название)
  const arg = text.replace('/mark', '').trim();
  
  if (!arg) {
    await sendMessage(userId, '❌ Укажи ID или название привычки: /mark [id или название]', sendOptions);
    return;
  }

  try {
    // markHabitComplete теперь поддерживает и ID, и название
    const result = await markHabitComplete(arg, dbUserId);
    await sendMessage(userId, 
      `🎉 Привычка "${result.habit.name}" отмечена!\n\n🔥 Streak: ${result.streak}\n+5 XP`,
      sendOptions
    );
  } catch (error) {
    await sendMessage(userId, '❌ Привычка не найдена', sendOptions);
  }
}

/**
 * Обработка карьерных целей
 */
async function handleCareer(userId, dbUserId, sendOptions = {}) {
  const goals = await getUserCareerGoals(dbUserId, 'active');
  
  if (goals.length === 0) {
    await sendMessage(userId, '🚀 У тебя пока нет карьерных целей. Создай первую: /goal [название]', sendOptions);
    return;
  }

  let text = '🚀 Твои карьерные цели:\n\n';
  goals.forEach((goal, idx) => {
    const progressBar = '█'.repeat(Math.floor(goal.progress / 10)) + '░'.repeat(10 - Math.floor(goal.progress / 10));
    text += `${idx + 1}. ${goal.title}\n`;
    text += `   ${progressBar} ${goal.progress}%\n\n`;
  });

  text += '💡 Создать цель: /goal [название]';

  await sendMessage(userId, text, sendOptions);
}

/**
 * Создание карьерной цели
 */
async function handleCreateGoal(userId, dbUserId, text, sendOptions = {}) {
  const goalText = text.replace('/goal', '').trim();
  
  if (!goalText) {
    await sendMessage(userId, '❌ Укажи название цели: /goal [название]', sendOptions);
    return;
  }

  const goal = await createCareerGoal(dbUserId, { title: goalText });
  await sendMessage(userId, `🚀 Цель "${goal.title}" создана!\n\nИспользуй /career чтобы посмотреть все цели`, sendOptions);
}

/**
 * Статистика пользователя
 */
async function handleStats(userId, dbUserId, sendOptions = {}) {
  const stats = await getUserStats(dbUserId);
  
  const text = `
📊 Твоя статистика:

👤 Уровень: ${stats.user.level} | XP: ${stats.user.xp}

📝 Задачи:
   Всего: ${stats.tasks.total || 0}
   Выполнено: ${stats.tasks.completed || 0}
   В работе: ${stats.tasks.pending || 0}

🍅 Pomodoro:
   Сессий: ${stats.pomodoro.total_sessions || 0}
   Завершено: ${stats.pomodoro.completed_sessions || 0}
   Минут: ${stats.pomodoro.total_minutes || 0}

✅ Привычки:
   Активных: ${stats.habits.total_habits || 0}
   Общий streak: ${stats.habits.total_streak || 0}

💪 Продолжай в том же духе!
  `.trim();

  await sendMessage(userId, text, sendOptions);
}

/**
 * Прогресс и рекомендации
 */
async function handleProgress(userId, dbUserId, sendOptions = {}) {
  const recommendations = await getCareerRecommendations(dbUserId);
  
  if (recommendations.length === 0) {
    await sendMessage(userId, '🚀 У тебя пока нет активных целей. Создай первую: /goal [название]', sendOptions);
    return;
  }

  let text = '💡 Рекомендации:\n\n';
  recommendations.forEach((rec, idx) => {
    text += `${idx + 1}. ${rec.message}\n\n`;
  });

  await sendMessage(userId, text, sendOptions);
}

module.exports = {
  handleMessage
};

