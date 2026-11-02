-- 公开纪念：只限已离世的人和宠物。没有任何互动，只有举报。
CREATE TABLE memorials (
  id            TEXT PRIMARY KEY,          -- 与档案 id 相同
  user_id       TEXT NOT NULL,             -- 发布者（永远不对外公开）
  payload       TEXT NOT NULL,             -- 校验过的快照 JSON
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,             -- person | pet
  lat           REAL,                      -- 地图上的纪念印，可为空
  lng           REAL,
  report_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'visible', -- visible | hidden
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX memorials_user ON memorials (user_id);
CREATE INDEX memorials_geo ON memorials (lat, lng);

CREATE TABLE memorial_reports (
  memorial_id TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (memorial_id, user_id)
);
