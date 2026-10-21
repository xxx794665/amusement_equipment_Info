-- 初始库结构（2026-10-21 动态化重构上线版，历史迁移请勿改动）。
-- 设备记录表：一台实体游艺设备一条记录；12 个文字字段与 8 个图片栏位。
-- settings 表当时用于全站展示页文案，2026-10-21 改为按设备维护，见 0002。
CREATE TABLE IF NOT EXISTS settings (
  key                  TEXT PRIMARY KEY,
  value                TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS devices (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  enabled             INTEGER NOT NULL DEFAULT 1,          -- 启用开关：0=下架（展示页 404）
  company             TEXT NOT NULL DEFAULT '',            -- 企业名称
  device_type         TEXT NOT NULL DEFAULT '',            -- 设备类别
  approval_number     TEXT NOT NULL DEFAULT '',            -- 审核批准编号
  device_name         TEXT NOT NULL DEFAULT '',            -- 设备名称
  power               TEXT NOT NULL DEFAULT '',            -- 产品功率
  owner               TEXT NOT NULL DEFAULT '',            -- 产权拥有人
  contact             TEXT NOT NULL DEFAULT '',            -- 联系人
  phone               TEXT NOT NULL DEFAULT '',            -- 电话
  address             TEXT NOT NULL DEFAULT '',            -- 地址
  zipcode             TEXT NOT NULL DEFAULT '',            -- 邮政编码
  game_intro          TEXT NOT NULL DEFAULT '',            -- 游戏内容简介
  instructions        TEXT NOT NULL DEFAULT '',            -- 操作说明
  img_appearance      TEXT NOT NULL DEFAULT '',            -- 外观说明图
  img_front           TEXT NOT NULL DEFAULT '',            -- 正视图
  img_left            TEXT NOT NULL DEFAULT '',            -- 左视图
  img_right           TEXT NOT NULL DEFAULT '',            -- 右视图
  img_panel           TEXT NOT NULL DEFAULT '',            -- 机台主控面板
  img_coin            TEXT NOT NULL DEFAULT '',            -- 投币口彩票出口
  img_control         TEXT NOT NULL DEFAULT '',            -- 玩家操控区域
  img_demo            TEXT NOT NULL DEFAULT '',            -- 玩家操作演示
  source_official_id  TEXT,                                 -- 预填采集来源的官方 id（追溯用）
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
