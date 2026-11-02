-- Been API · D1 (SQLite) schema
-- 原则：服务端只是「同步中转」和「地点墙」。个人印记以客户端为准，服务端存 JSON 快照。

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,            -- google | apple
  subject     TEXT NOT NULL,            -- 身份提供方的稳定用户 id
  seq         INTEGER NOT NULL DEFAULT 0, -- 该用户的同步游标
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

-- 个人数据：印记与照片元数据，一律存完整快照，按 updated_at 后写胜出
CREATE TABLE records (
  user_id     TEXT NOT NULL,
  entity      TEXT NOT NULL,            -- trace | photo
  id          TEXT NOT NULL,
  payload     TEXT NOT NULL,            -- JSON
  updated_at  INTEGER NOT NULL,
  seq         INTEGER NOT NULL,
  PRIMARY KEY (user_id, entity, id)
);
CREATE INDEX records_user_seq ON records (user_id, seq);

-- 地点墙：geohash-6 一格
CREATE TABLE walls (
  key             TEXT PRIMARY KEY,
  center_lat      REAL NOT NULL,
  center_lng      REAL NOT NULL,
  display_name    TEXT,
  visitor_count   INTEGER NOT NULL DEFAULT 0,
  first_visit_at  INTEGER
);

-- 一个人在一面墙上只算一次，seq 即「第几位来过的人」
CREATE TABLE wall_visits (
  wall_key    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  trace_id    TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (wall_key, user_id)
);

CREATE TABLE wall_notes (
  id            TEXT PRIMARY KEY,
  wall_key      TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  trace_id      TEXT,
  text          TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  season_label  TEXT NOT NULL,
  same_count    INTEGER NOT NULL DEFAULT 0,
  report_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'visible', -- visible | hidden
  created_at    INTEGER NOT NULL,
  UNIQUE (wall_key, user_id)
);
CREATE INDEX wall_notes_wall ON wall_notes (wall_key, status, created_at);

-- 「我也是」：一人一次
CREATE TABLE wall_sames (
  note_id   TEXT NOT NULL,
  user_id   TEXT NOT NULL,
  PRIMARY KEY (note_id, user_id)
);

-- 举报：达到阈值自动隐藏（应用商店对 UGC 的要求）
CREATE TABLE wall_reports (
  note_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);

-- 屏蔽：被屏蔽者的留言不再出现在屏蔽者眼前
CREATE TABLE blocks (
  user_id     TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);
