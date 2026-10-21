// 图片栏位的 R2 存取：选图即传（临时键）→ 保存时转正式键（覆盖式）→ /img/ 路径公开读取。
// 键规则：amusement/<设备id>/<栏位>.<扩展名>；未保存的新图先落 amusement/tmp/<随机id>/…，
// 保存设备时由服务端转存到正式键（换图后 URL 不变，页面自动生效）。

import { ApiError, randomHex } from "./util.js";
import { SLOTS, MAX_IMAGE_BYTES, MIME_TO_EXT, SLOT_BY_KEY } from "./constants.js";

const TMP_PREFIX = "amusement/tmp/";
const KEY_RE = /^amusement\/[A-Za-z0-9][A-Za-z0-9_\-/.]*$/;

const SLOT_SET = new Set(SLOTS.map((s) => s.slot));

export function isTmpPath(value) {
  return typeof value === "string" && value.startsWith(`/img/${TMP_PREFIX}`);
}

export async function saveTmpImage(env, file, slot) {
  if (!SLOT_SET.has(slot)) throw new ApiError(400, `非法图片栏位: ${slot}`);
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "缺少图片文件");
  const ext = MIME_TO_EXT[file.type];
  if (!ext) throw new ApiError(400, "仅支持 JPEG / PNG / WebP 图片");
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(413, "图片超过 5MB 限制");
  const key = `${TMP_PREFIX}${randomHex(8)}/${slot}.${ext}`;
  await env.IMAGES.put(key, file, { httpMetadata: { contentType: file.type } });
  return { slot, path: `/img/${key}`, tmpKey: key };
}

// 设备保存（新增/编辑）时调用：把表单里指向临时键的图片转存到正式键，返回改写后的字段
export async function commitTmpImages(env, deviceId, fields) {
  const rewritten = { ...fields };
  for (const s of SLOTS) {
    const value = fields[s.key];
    if (!isTmpPath(value)) continue;
    const tmpKey = value.slice("/img/".length);
    const ext = tmpKey.split(".").pop();
    const finalKey = `amusement/${deviceId}/${s.slot}.${ext}`;
    const obj = await env.IMAGES.get(tmpKey);
    if (!obj) throw new ApiError(400, `「${s.title}」的图片已失效，请重新选择上传`);
    await env.IMAGES.put(finalKey, obj.body, {
      httpMetadata: { contentType: obj.httpMetadata?.contentType || "application/octet-stream" },
    });
    await env.IMAGES.delete(tmpKey);
    rewritten[s.key] = `/img/${finalKey}`;
  }
  return rewritten;
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
