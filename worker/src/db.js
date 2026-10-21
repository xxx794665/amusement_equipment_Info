// D1 设备记录 CRUD

import { ApiError } from "./util.js";
import { TEXT_KEYS, IMG_KEYS, DISPLAY_SETTING_KEYS, DISPLAY_SETTING_MAX_LEN } from "./constants.js";

// 设备记录可写字段 = 12 个文字字段 + 8 个图片栏位 + 本设备单独的展示页设置
const ALL_KEYS = [...TEXT_KEYS, ...IMG_KEYS, ...DISPLAY_SETTING_KEYS];
const DISPLAY_KEY_SET = new Set(DISPLAY_SETTING_KEYS);
const LIST_COLS = "id, enabled, device_name, device_type, approval_number, img_front, updated_at";

export async function listDevices(db, includeDisabled) {
  const where = includeDisabled ? "" : "WHERE enabled = 1";
  const { results } = await db.prepare(`SELECT ${LIST_COLS} FROM devices ${where} ORDER BY id`).all();
  return results || [];
}

export async function getDevice(db, id) {
  if (!/^\d+$/.test(String(id))) throw new ApiError(400, "非法设备 id");
  const row = await db
    .prepare(`SELECT * FROM devices WHERE id = ?`)
    .bind(Number(id))
    .first();
  if (!row) throw new ApiError(404, "设备不存在");
  return row;
}

function pickDeviceFields(body) {
  // 只接受白名单字段；图片字段值必须是字符串（路径或 URL）
  const out = {};
  for (const k of ALL_KEYS) {
    if (body[k] === undefined) continue;
    if (typeof body[k] !== "string") throw new ApiError(400, `字段 ${k} 必须是字符串`);
    if (DISPLAY_KEY_SET.has(k)) {
      // 展示页设置：去首尾空白（空串=用默认文案），限长防误贴长文
      const v = body[k].trim();
      if (v.length > DISPLAY_SETTING_MAX_LEN) {
        throw new ApiError(400, `字段 ${k} 过长（上限 ${DISPLAY_SETTING_MAX_LEN} 字）`);
      }
      out[k] = v;
    } else {
      out[k] = body[k];
    }
  }
  if (body.enabled !== undefined) out.enabled = body.enabled ? 1 : 0;
  return out;
}

export async function createDevice(db, body) {
  const f = pickDeviceFields(body);
  const cols = ["enabled", ...ALL_KEYS];
  const vals = [f.enabled ?? 1, ...ALL_KEYS.map((k) => f[k] ?? "")];
  const row = await db
    .prepare(
      `INSERT INTO devices (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING id`,
    )
    .bind(...vals)
    .first();
  return row.id;
}

export async function updateDevice(db, id, body) {
  await getDevice(db, id); // 确认存在，否则 404
  const f = pickDeviceFields(body);
  const sets = [];
  const vals = [];
  if (f.enabled !== undefined) {
    sets.push("enabled = ?");
    vals.push(f.enabled);
  }
  for (const k of ALL_KEYS) {
    if (f[k] !== undefined) {
      sets.push(`${k} = ?`);
      vals.push(f[k]);
    }
  }
  if (sets.length === 0) throw new ApiError(400, "没有需要更新的字段");
  sets.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE devices SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...vals, Number(id))
    .run();
}

export async function deleteDevice(db, id) {
  await getDevice(db, id);
  await db.prepare(`DELETE FROM devices WHERE id = ?`).bind(Number(id)).run();
}
