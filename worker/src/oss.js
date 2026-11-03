// 阿里云 OSS 服务端操作（V1 签名，全程不设 Date 头，服务端调用走 URL 签名规避Workers 头限制）：
// - presignPutUrl：预签名直传 URL（浏览器→OSS，国内快，密钥不出服务端）
// - deleteObject：图片对象删除（换图/删图清理，best-effort）
// AK/SK 为 Worker secrets（OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET），不入库不入前端。
// 桶为公共读（对象继承桶 ACL，图片直链可公开访问）。
// 上传即最终键（ADR-0005）：不再有临时键与保存时 CopyObject 转存，保存请求零 OSS 操作。

import { ApiError } from "./util.js";

const PRESIGN_TTL = 300; // 预签名 5 分钟
const OP_TTL = 60; // 服务端操作签名 60 秒（即签即用）

// 轻量配置：只看端点/桶名（未配密钥也不报错），供 URL 判断与字段校验使用
export function ossEndpointBucket(env) {
  const endpoint = env.OSS_ENDPOINT || "oss-cn-beijing.aliyuncs.com";
  const bucket = env.OSS_BUCKET || "awhf-oss-app";
  return { endpoint, bucket, publicBase: `https://${bucket}.${endpoint}` };
}

// 严格配置：签名类操作（预签名/删除）必须有 AK/SK
export function ossConfig(env) {
  const ak = env.OSS_ACCESS_KEY_ID;
  const sk = env.OSS_ACCESS_KEY_SECRET;
  if (!ak || !sk) throw new ApiError(500, "OSS 密钥未配置（Worker secrets 缺失）");
  return { ...ossEndpointBucket(env), ak, sk };
}

export function ossPublicUrl(env, key) {
  return `${ossEndpointBucket(env).publicBase}/${key}`;
}

// 本桶对象直链 → key（非本桶 URL / 非字符串返回 null）
export function ossKeyFromUrl(env, value) {
  const { publicBase } = ossEndpointBucket(env);
  if (typeof value !== "string" || !value.startsWith(`${publicBase}/`)) return null;
  return value.slice(publicBase.length + 1) || null;
}

function b64(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

async function hmacSha1B64(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

async function signedUrl(env, method, key, contentType = "", ossHeader = null) {
  const { endpoint, bucket, ak, sk } = ossConfig(env);
  const expires = Math.floor(Date.now() / 1000) + (contentType ? PRESIGN_TTL : OP_TTL);
  const headerLine = ossHeader ? `${ossHeader.name}:${ossHeader.value}\n` : "";
  const stringToSign = `${method}\n\n${contentType}\n${expires}\n${headerLine}/${bucket}/${key}`;
  const sig = encodeURIComponent(await hmacSha1B64(sk, stringToSign));
  return (
    `https://${bucket}.${endpoint}/${key}` +
    `?OSSAccessKeyId=${encodeURIComponent(ak)}&Expires=${expires}&Signature=${sig}`
  );
}

// 预签名直传 URL：浏览器 PUT 时必须带签名的 Content-Type（与签名字符串一致）
export async function presignPutUrl(env, key, contentType) {
  return signedUrl(env, "PUT", key, contentType);
}

export async function deleteObject(env, key) {
  const url = await signedUrl(env, "DELETE", key);
  try {
    await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(15000) });
  } catch {
    // 删除失败仅留孤儿对象，不阻塞保存
  }
}
