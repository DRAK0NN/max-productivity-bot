// Базовые тесты для обработчика сообщений
// В реальном проекте тут было бы больше тестов, но для MVP сойдет

const { handleMessage } = require('../src/handlers/messageHandler');

// Моки для сервисов
jest.mock('../src/services/maxApi');
jest.mock('../src/services/userService');
jest.mock('../src/services/taskService');
jest.mock('../src/services/pomodoroService');
jest.mock('../src/services/habitService');
jest.mock('../src/services/careerService');

describe('Message Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('должен обрабатывать команду /start', async () => {
    const message = {
      user_id: '123',
      text: '/start'
    };

    // Мокаем зависимости
    const { getOrCreateUser } = require('../src/services/userService');
    getOrCreateUser.mockResolvedValue({
      id: 1,
      max_user_id: '123',
      level: 1,
      xp: 0
    });

    const { sendMessageWithButtons } = require('../src/services/maxApi');
    sendMessageWithButtons.mockResolvedValue({});

    await handleMessage(message);

    expect(getOrCreateUser).toHaveBeenCalledWith('123', null);
    expect(sendMessageWithButtons).toHaveBeenCalled();
  });

  test('должен обрабатывать команду /tasks', async () => {
    const message = {
      user_id: '123',
      text: '/tasks'
    };

    const { getOrCreateUser } = require('../src/services/userService');
    getOrCreateUser.mockResolvedValue({
      id: 1,
      max_user_id: '123'
    });

    const { getUserTasks } = require('../src/services/taskService');
    getUserTasks.mockResolvedValue([]);

    const { sendMessage } = require('../src/services/maxApi');
    sendMessage.mockResolvedValue({});

    await handleMessage(message);

    expect(getUserTasks).toHaveBeenCalledWith(1, null);
  });

  // Можно добавить больше тестов, но для MVP этого достаточно
});

