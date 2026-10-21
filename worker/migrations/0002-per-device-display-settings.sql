-- 展示页 title / 顶部 scanTop 批准单位：从全站 settings 表改为每台设备记录单独维护。
-- 1) devices 增加 page_title、scan_top 两列（空串=展示页回落 constants.js 默认文案）
-- 2) 把原全局 settings 表里已保存的值下发给每台设备（设备自身已有值的保留）
-- 3) 删除全局 settings 表
-- 说明：本迁移对所有设备生效一次；若旧 settings 表为空/无行，设备字段保持空串即得默认文案。
ALTER TABLE devices ADD COLUMN page_title TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN scan_top TEXT NOT NULL DEFAULT '';

UPDATE devices
SET page_title = COALESCE(
  (SELECT value FROM settings WHERE key = 'page_title' AND value <> ''),
  ''
)
WHERE page_title = '';

UPDATE devices
SET scan_top = COALESCE(
  (SELECT value FROM settings WHERE key = 'scan_top' AND value <> ''),
  ''
)
WHERE scan_top = '';

DROP TABLE IF EXISTS settings;
