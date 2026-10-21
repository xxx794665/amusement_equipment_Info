// D1 展示页设置读写：settings 表（key-value），空值/无行回落 constants.js 默认值。

import { ApiError } from "./util.js";
import { DEFAULT_PAGE_TITLE, DEFAULT_PAGE_TOP, SETTING_KEYS, SETTING_MAX_LEN } from "./constants.js";

const DEFAULTS = { page_title: DEFAULT_PAGE_TITLE, scan_top: DEFAULT_PAGE_TOP };

// 返回生效值（设置值或默认值）+ 默认值，供展示页渲染与管理端回显
export async function getDisplaySettings(db) {
  const { results } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${SETTING_KEYS.map(() => "?").join(", ")})`)
    .bind(...SETTING_KEYS)
    .all();
  const settings = { ...DEFAULTS };
  for (const row of results || []) {
    if (typeof row.value === "string" && row.value) settings[row.key] = row.value;
  }
  return { settings, defaults: { ...DEFAULTS } };
}

// 部分更新：仅接受白名单键；空字符串=删除该行（恢复默认）
export async function saveDisplaySettings(db, body) {
  const del = [];
  const rows = [];
  for (const k of SETTING_KEYS) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== "string") throw new ApiError(400, `设置 ${k} 必须是字符串`);
    const v = body[k].trim();
    if (v.length > SETTING_MAX_LEN) throw new ApiError(400, `设置 ${k} 过长（上限 ${SETTING_MAX_LEN} 字）`);
    if (v) rows.push([k, v]);
    else del.push(k);
  }
  if (rows.length === 0 && del.length === 0) throw new ApiError(400, "没有需要更新的设置");
  for (const [k, v] of rows) {
    await db
      .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .bind(k, v)
      .run();
  }
  for (const k of del) {
    await db.prepare(`DELETE FROM settings WHERE key = ?`).bind(k).run();
  }
}
