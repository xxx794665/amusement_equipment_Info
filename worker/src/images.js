// 图片栏位存取，双存储后端：
// - CF R2（IMAGES 绑定）：选图即传临时键 amusement/tmp/<随机id>/… → 保存时转正式键
// - 阿里云 OSS（预签名直传，见 oss.js）：浏览器直传北京，保存时 OSS 服务端拷贝转正
// 正式键规则统一为 amusement/<设备id>/<栏位>.<扩展名>（换图覆盖同键，URL 不变）。
// 库内存放：R2 图为 /img/… 站内路径；OSS 图为 https://<桶>.<端点>/… 直链（国内快）。

import { ApiError, randomHex } from "./util.js";
import { SLOTS, MAX_IMAGE_BYTES, MIME_TO_EXT } from "./constants.js";
import { presignPutUrl, ossPublicUrl, ossTmpKeyFromUrl, ossEndpointBucket, copyObject, deleteObject, newTmpKey } from "./oss.js";

const TMP_PREFIX = "amusement/tmp/";
const KEY_RE = /^amusement\/[A-Za-z0-9][A-Za-z0-9_\-/.]*$/;

const SLOT_SET = new Set(SLOTS.map((s) => s.slot));

export function isR2TmpPath(value) {
  return typeof value === "string" && value.startsWith(`/img/${TMP_PREFIX}`);
}

function checkSlotFile(slot, contentType, size) {
  if (!SLOT_SET.has(slot)) throw new ApiError(400, `非法图片栏位: ${slot}`);
  if (!MIME_TO_EXT[contentType]) throw new ApiError(400, "仅支持 JPEG / PNG / WebP 图片");
  if (size != null && size > MAX_IMAGE_BYTES) throw new ApiError(413, "图片超过 5MB 限制");
}

// ---- 上传入口 A：R2（multipart 直传 Worker，经绑定写桶） ----
export async function saveTmpImage(env, file, slot) {
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "缺少图片文件");
  checkSlotFile(slot, file.type, file.size);
  const ext = MIME_TO_EXT[file.type];
  const key = `${TMP_PREFIX}${randomHex(8)}/${slot}.${ext}`;
  await env.IMAGES.put(key, file, { httpMetadata: { contentType: file.type } });
  return { slot, path: `/img/${key}`, tmpKey: key };
}

// ---- 上传入口 B：OSS（返回预签名 URL，浏览器直传北京） ----
export async function presignTmpImage(env, slot, contentType, sizeBytes) {
  checkSlotFile(slot, contentType, sizeBytes);
  const ext = MIME_TO_EXT[contentType];
  const key = newTmpKey(slot, ext);
  const uploadUrl = await presignPutUrl(env, key, contentType);
  return { slot, path: ossPublicUrl(env, key), tmpKey: key, uploadUrl };
}

// ---- 保存设备时：把两种后端的临时图统一转存到正式键 ----
export async function commitTmpImages(env, deviceId, fields) {
  const rewritten = { ...fields };
  for (const s of SLOTS) {
    const value = fields[s.key];
    if (isR2TmpPath(value)) {
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
    } else {
      const tmpKey = ossTmpKeyFromUrl(env, value);
      if (tmpKey) {
        const ext = tmpKey.split(".").pop();
        const finalKey = `amusement/${deviceId}/${s.slot}.${ext}`;
        await copyObject(env, tmpKey, finalKey);
        await deleteObject(env, tmpKey);
        rewritten[s.key] = ossPublicUrl(env, finalKey);
      }
    }
  }
  return rewritten;
}

// 图片字段值校验：仅接受空值、站内 /img/ 路径或本桶 OSS 直链
export function validateImageValues(fields, env) {
  const { publicBase } = ossEndpointBucket(env);
  for (const s of SLOTS) {
    const v = fields[s.key];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string" || !(v.startsWith("/img/") || v.startsWith(`${publicBase}/`))) {
      throw new ApiError(400, `「${s.title}」的图片地址不合法`);
    }
  }
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
