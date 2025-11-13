// Подключение к БД (Supabase/PostgreSQL)
// В продакшене лучше использовать пул соединений, но для MVP сойдет и так

const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

// Ленивая инициализация пула
function getPool() {
  if (!pool) {
    // Для локальной БД SSL не нужен, для Supabase/облачных - нужен
    const isLocalDB = process.env.DATABASE_URL?.includes('localhost') || 
                     process.env.DATABASE_URL?.includes('127.0.0.1') ||
                     process.env.DATABASE_URL?.includes('postgres:5432');
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocalDB ? false : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
    });

    // Обработка ошибок подключения
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      // В реальном проекте тут бы был retry механизм
    });
  }
  return pool;
}

// Инициализация таблиц (вызывается при старте)
async function initDatabase() {
  const db = getPool();
  
  try {
    // Таблица пользователей
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        max_user_id VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255),
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица задач
    await db.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        priority VARCHAR(20) DEFAULT 'medium',
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Таблица Pomodoro сессий
    await db.query(`
      CREATE TABLE IF NOT EXISTS pomodoro_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        duration INTEGER DEFAULT 25,
        completed BOOLEAN DEFAULT false,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    
    // Миграции для pomodoro_sessions (добавляем столбцы если их нет)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pomodoro_sessions' AND column_name = 'task_id'
        ) THEN
          ALTER TABLE pomodoro_sessions ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pomodoro_sessions' AND column_name = 'completed'
        ) THEN
          ALTER TABLE pomodoro_sessions ADD COLUMN completed BOOLEAN DEFAULT false;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pomodoro_sessions' AND column_name = 'completed_at'
        ) THEN
          ALTER TABLE pomodoro_sessions ADD COLUMN completed_at TIMESTAMP;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pomodoro_sessions' AND column_name = 'started_at'
        ) THEN
          ALTER TABLE pomodoro_sessions ADD COLUMN started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);

    // Таблица привычек
    await db.query(`
      CREATE TABLE IF NOT EXISTS habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        reminder_time TIME,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Миграции для habits (добавляем столбцы если их нет)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'habits' AND column_name = 'active'
        ) THEN
          ALTER TABLE habits ADD COLUMN active BOOLEAN DEFAULT true;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'habits' AND column_name = 'streak'
        ) THEN
          ALTER TABLE habits ADD COLUMN streak INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'habits' AND column_name = 'best_streak'
        ) THEN
          ALTER TABLE habits ADD COLUMN best_streak INTEGER DEFAULT 0;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'habits' AND column_name = 'reminder_time'
        ) THEN
          ALTER TABLE habits ADD COLUMN reminder_time TIME;
        END IF;
      END $$;
    `);

    // Таблица трекинга привычек (каждый день)
    await db.query(`
      CREATE TABLE IF NOT EXISTS habit_tracking (
        id SERIAL PRIMARY KEY,
        habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        completed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(habit_id, date)
      )
    `);

    // Таблица карьерных целей
    await db.query(`
      CREATE TABLE IF NOT EXISTS career_goals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        target_date DATE,
        progress INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Миграции для career_goals (добавляем столбцы если их нет)
    await db.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'career_goals' AND column_name = 'target_date'
        ) THEN
          ALTER TABLE career_goals ADD COLUMN target_date DATE;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'career_goals' AND column_name = 'progress'
        ) THEN
          ALTER TABLE career_goals ADD COLUMN progress INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);

    // Индексы для производительности (на всякий случай)
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_users_max_id ON users(max_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_pomodoro_user_id ON pomodoro_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
      CREATE INDEX IF NOT EXISTS idx_habit_tracking_user_date ON habit_tracking(user_id, date);
    `);

    console.log('✅ База данных инициализирована успешно');
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
}

module.exports = {
  getPool,
  initDatabase
};

