// 图片栏位存取，双存储后端（上传即最终键，保存时零存储操作，见 ADR-0005）：
// - CF R2（IMAGES 绑定）：multipart 经绑定直接写最终键
// - 阿里云 OSS（预签名直传，见 oss.js）：浏览器直传北京最终键
// 键规则：amusement/<栏位>/<随机hex>.<扩展名>，上传时一次生成、此后不改名；
// 历史设备仍用旧键 amusement/<设备id>/<栏位>.<ext>，读取与删除均兼容。
// 库内存放：每栏位为 JSON 数组字符串（如 '["https://…","/img/…"]'，≤9 张）；
// 旧版单图记录为纯 URL 字符串，读取端统一解析。R2 图为 /img/… 站内路径；OSS 图为直链。

import { ApiError, randomHex } from "./util.js";
import { SLOTS, MAX_IMAGE_BYTES, MAX_IMAGES_PER_SLOT, MIME_TO_EXT } from "./constants.js";
import { presignPutUrl, ossPublicUrl, ossKeyFromUrl, ossEndpointBucket, deleteObject } from "./oss.js";

const KEY_RE = /^amusement\/[A-Za-z0-9][A-Za-z0-9_\-/.]*$/;
// 可删除的正式键：历史键 amusement/<数字设备id>/… 与现行键 amusement/<栏位>/…
const FINAL_KEY_RE = new RegExp(`^amusement/(\\d+|${SLOTS.map((s) => s.slot).join("|")})/`);
const TMP_KEY_RE = /^amusement\/tmp\//; // 已下线的临时键（旧会话残留，保存/丢弃一律拒绝）

// 库内图片栏位值 → URL 数组。兼容三种形态：现行 JSON 数组字符串、
// 请求体里的真数组、旧版单图纯 URL 字符串；空值/损坏值 → 空数组。
export function parseStoredImages(value) {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    const t = value.trim();
    if (t === "") raw = [];
    else if (t.startsWith("[")) raw = tryParseArray(t);
    else raw = [t];
  }
  return raw.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

function tryParseArray(t) {
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const SLOT_SET = new Set(SLOTS.map((s) => s.slot));

function checkSlotFile(slot, contentType, size) {
  if (!SLOT_SET.has(slot)) throw new ApiError(400, `非法图片栏位: ${slot}`);
  if (!MIME_TO_EXT[contentType]) throw new ApiError(400, "仅支持 JPEG / PNG / WebP 图片");
  if (size != null && size > MAX_IMAGE_BYTES) throw new ApiError(413, "图片超过 5MB 限制");
}

// ---- 上传入口 A：R2（multipart 直传 Worker，经绑定写最终键） ----
export async function saveImage(env, file, slot) {
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "缺少图片文件");
  checkSlotFile(slot, file.type, file.size);
  const ext = MIME_TO_EXT[file.type];
  const key = `amusement/${slot}/${randomHex(12)}.${ext}`;
  await env.IMAGES.put(key, file, { httpMetadata: { contentType: file.type } });
  return { slot, path: `/img/${key}` };
}

// ---- 上传入口 B：OSS（返回预签名 URL，浏览器直传北京最终键） ----
export async function presignImage(env, slot, contentType, sizeBytes) {
  checkSlotFile(slot, contentType, sizeBytes);
  const ext = MIME_TO_EXT[contentType];
  const key = `amusement/${slot}/${randomHex(12)}.${ext}`;
  const uploadUrl = await presignPutUrl(env, key, contentType);
  return { slot, path: ossPublicUrl(env, key), uploadUrl };
}

// ---- 图片字段值校验：接受 JSON 数组字符串/真数组或旧版单 URL 字符串；
// 每个地址必须是站内 /img/ 路径或本桶 OSS 直链；每栏位 ≤9 张；拒绝已下线的临时键 ----
export function validateImageValues(fields, env) {
  const { publicBase } = ossEndpointBucket(env);
  for (const s of SLOTS) {
    const v = fields[s.key];
    if (v === undefined || v === null || v === "") continue;
    const urls = parseStoredImages(v);
    if (urls.length > MAX_IMAGES_PER_SLOT) {
      throw new ApiError(400, `「${s.title}」最多 ${MAX_IMAGES_PER_SLOT} 张图片`);
    }
    for (const u of urls) {
      if (!(u.startsWith("/img/") || u.startsWith(`${publicBase}/`))) {
        throw new ApiError(400, `「${s.title}」的图片地址不合法`);
      }
      const key = u.startsWith("/img/") ? u.slice("/img/".length) : ossKeyFromUrl(env, u);
      if (key && TMP_KEY_RE.test(key)) {
        throw new ApiError(400, `「${s.title}」的图片是旧版临时上传已失效，请删除后重新选择上传`);
      }
    }
  }
}

// ---- 图片删除（管理端删除/换图时清理存储对象，一律 best-effort） ----

// 库内值 → 存储键：R2 站内路径 /img/… 取后半段，OSS 本桶直链用 ossKeyFromUrl；解析不出返回 null
function imageKeyFromValue(env, value) {
  if (typeof value !== "string" || value === "") return null;
  if (value.startsWith("/img/")) return { key: value.slice("/img/".length), r2: true };
  const key = ossKeyFromUrl(env, value);
  return key ? { key, r2: false } : null;
}

// 删除某个正式图片对象：R2 走绑定 delete，OSS 走 deleteObject。
// 仅删正式键（历史设备键或现行栏位键，不匹配直接跳过），失败不抛错（留孤儿对象，不阻塞保存）。
export async function deleteStoredImage(env, value) {
  const parsed = imageKeyFromValue(env, value);
  if (!parsed || !FINAL_KEY_RE.test(parsed.key)) return false;
  try {
    if (parsed.r2) await env.IMAGES.delete(parsed.key);
    else await deleteObject(env, parsed.key); // 缺 AK/SK 时其内部会 throw，这里一并兜住
    return true;
  } catch {
    return false;
  }
}

// 全站任一设备任一图片栏位是否仍引用该 URL（换图/删图清理前防误删共享对象）。
// 键不再内嵌设备 id，无法从键判断归属，只能查库；设备量级小，全表扫 8 列足够快。
async function urlReferenced(db, url) {
  const { results } = await db.prepare(`SELECT ${SLOTS.map((s) => s.key).join(", ")} FROM devices`).all();
  for (const row of results || []) {
    for (const s of SLOTS) {
      if (parseStoredImages(row[s.key]).includes(url)) return true;
    }
  }
  return false;
}

// 保存设备时清理被移除的旧图对象（best-effort）：
// 只处理本次请求体里出现的栏位（未提交的栏位一律跳过，因此「上架/下架」只发 { enabled } 不会触发）；
// 每个被移除的 URL 删除前查库确认全站已无引用（防止 A 设备引用 B 设备图片 URL 时误删对象）；
// 查询/删除失败均不影响保存结果。
export async function deleteRemovedImages(env, db, before, after) {
  if (!before || !after) return;
  const removed = new Set();
  for (const s of SLOTS) {
    if (!Object.prototype.hasOwnProperty.call(after, s.key)) continue;
    const next = parseStoredImages(after[s.key]);
    for (const u of parseStoredImages(before[s.key])) {
      if (!next.includes(u)) removed.add(u);
    }
  }
  for (const u of removed) {
    try {
      if (await urlReferenced(db, u)) continue;
      await deleteStoredImage(env, u);
    } catch {
      // 清理失败仅留孤儿对象，不阻塞保存
    }
  }
}

// 删除一张尚未保存入库的图片（管理端在表单里移除刚上传的图时调用）：
// 服务端再查一次库确认全站无引用后才删，防误删已保存图片；幂等。
export async function discardUnsavedImage(env, db, value) {
  const parsed = imageKeyFromValue(env, typeof value === "string" ? value.trim() : "");
  if (!parsed || !FINAL_KEY_RE.test(parsed.key)) throw new ApiError(400, "图片地址不合法");
  let referenced = true;
  try {
    referenced = await urlReferenced(db, value.trim());
  } catch {
    referenced = true; // 查询失败宁可留孤儿对象也不误删
  }
  if (referenced) throw new ApiError(400, "该图片已被保存使用，请通过保存流程更换或删除");
  await deleteStoredImage(env, value.trim());
  return { ok: true };
}

export async function serveImage(env, rawKey, request) {
  const key = decodeURIComponent(rawKey);
  if (!KEY_RE.test(key)) throw new ApiError(404, "图片不存在");
  const obj = await env.IMAGES.get(key);
  if (!obj) throw new ApiError(404, "图片不存在");
  const headers = {
    "content-type": obj.httpMetadata?.contentType || "application/octet-stream",
    "cache-control": "public, max-age=86400",
  };
  const etag = obj.httpEtag ? obj.httpEtag.replace(/^"|"$/g, "") : null;
  if (etag) {
    headers.etag = `"${etag}"`;
    const inm = request.headers.get("if-none-match");
    if (inm && inm.replace(/^"|"$/g, "") === etag) {
      return new Response(null, { status: 304, headers });
    }
  }
  return new Response(obj.body, { status: 200, headers });
}
