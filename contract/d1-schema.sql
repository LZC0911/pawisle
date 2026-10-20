-- 绒屿 PAWISLE · Cloudflare D1 (SQLite) 建表语句
-- 与 worker/src/index.js 内嵌 SCHEMA 保持一致；Worker 首次请求会自动建表+种子，
-- 本文件用于交接审阅，也可手动执行：wrangler d1 execute pawisle --file=contract/d1-schema.sql

CREATE TABLE IF NOT EXISTS pets(
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'u1',      -- 归属用户（鉴权后按用户隔离）
  name TEXT NOT NULL,
  species TEXT NOT NULL,          -- cat | dog
  breed TEXT, gender TEXT, age TEXT,
  weight REAL, score INTEGER,
  avatar TEXT,
  tags TEXT DEFAULT '[]'          -- JSON 数组字符串
);

CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  pass_hash TEXT,                 -- PBKDF2(100k, SHA-256) hex
  salt TEXT,                      -- 16 字节随机 hex
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS weights(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id TEXT NOT NULL REFERENCES pets(id),
  d TEXT NOT NULL,                -- MM-DD
  w REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weights_pet ON weights(pet_id);

CREATE TABLE IF NOT EXISTS records(   -- 健康时间线（疫苗/体检/洗护/驱虫…）
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id TEXT NOT NULL REFERENCES pets(id),
  date TEXT NOT NULL,             -- YYYY-MM-DD
  type TEXT, icon TEXT, title TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_pet ON records(pet_id, date DESC);

CREATE TABLE IF NOT EXISTS reminders(
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL REFERENCES pets(id),
  title TEXT, date TEXT, icon TEXT,
  urgent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS circles(
  id TEXT PRIMARY KEY,
  name TEXT, members TEXT,        -- members 为展示字符串 "12.8k"
  "desc" TEXT, species TEXT
);

CREATE TABLE IF NOT EXISTS circle_members(   -- 用户已加入的圈子
  user_id TEXT NOT NULL,
  circle_id TEXT NOT NULL,
  PRIMARY KEY(user_id, circle_id)
);

CREATE TABLE IF NOT EXISTS posts(
  id TEXT PRIMARY KEY,
  circle TEXT, author TEXT, pet TEXT, time TEXT,
  title TEXT, excerpt TEXT, img TEXT,
  likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, views TEXT,
  essence INTEGER DEFAULT 0,       -- 精华
  member_only INTEGER DEFAULT 0    -- 会员专享
);

CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL REFERENCES posts(id),
  author TEXT, text TEXT, time TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY,
  name TEXT, cat TEXT,
  price REAL, member REAL,         -- 原价 / 会员价
  img TEXT, tag TEXT, "desc" TEXT
);

CREATE TABLE IF NOT EXISTS cart(
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER DEFAULT 1,
  PRIMARY KEY(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE,
  user_id TEXT,
  items TEXT,                      -- JSON [{id,qty}]
  total REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS memberships(
  user_id TEXT PRIMARY KEY,
  plan TEXT,                       -- free | pro_m | pro_y
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS page_views(   -- 访问量与访客归属地
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT, ref TEXT,
  country TEXT, region TEXT, city TEXT,  -- 来自 request.cf
  ua TEXT, ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pv_ts ON page_views(ts);
CREATE INDEX IF NOT EXISTS idx_pv_country ON page_views(country);
