-- 按地图范围查询地点墙（「别人来过」图层）
CREATE INDEX IF NOT EXISTS walls_lat_lng ON walls (center_lat, center_lng);
