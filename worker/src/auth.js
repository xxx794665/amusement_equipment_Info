// 管理端认证：单口令登录 + HMAC 签名 Cookie（HttpOnly/SameSite=Strict）。
// 口令与 Cookie 签名密钥均为 Worker secret（ADMIN_PASSWORD / COOKIE_SECRET），
// 不出现在代码与仓库中。登录失败限流为单实例内存级（配合长随机口令足够）。

import { ApiError, nowSec, timingSafeEqual } from "./util.js";

const COOKIE_NAME = "admin";
const SESSION_TTL = 7 * 24 * 3600; // 7 天
const LIMIT_WINDOW = 10 * 60; // 10 分钟窗口
const LIMIT_MAX_FAIL = 10; // 窗口内最多失败次数

const failRecords = new Map(); // ip -> {n, resetAt}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

export function checkLoginRate(ip) {
  const r = failRecords.get(ip);
  if (r && r.n >= LIMIT_MAX_FAIL && nowSec() < r.resetAt) {
    throw new ApiError(429, "失败次数过多，请 10 分钟后再试");
  }
}

export function recordLoginFail(ip) {
  const r = failRecords.get(ip);
  if (!r || nowSec() >= r.resetAt) {
    failRecords.set(ip, { n: 1, resetAt: nowSec() + LIMIT_WINDOW });
  } else {
    r.n += 1;
  }
}

export function clearLoginFails(ip) {
  failRecords.delete(ip);
}

async function hmacHex(secret, msg) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function digestHex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, env) {
  // 双方都取摘要后恒时比较，避免长度泄露
  const a = await digestHex(String(password));
  const b = await digestHex(env.ADMIN_PASSWORD || "");
  return timingSafeEqual(a, b);
}

// Secure 标记仅在 https 下启用（本地 wrangler dev 走 http，浏览器不发 Secure Cookie）
export async function buildSessionCookie(request, env) {
  const exp = nowSec() + SESSION_TTL;
  const sig = await hmacHex(env.COOKIE_SECRET, String(exp));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return (
    `${COOKIE_NAME}=${exp}.${sig}; Max-Age=${SESSION_TTL}; Path=/; HttpOnly; SameSite=Strict${secure}`
  );
}

export function clearCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

export async function checkAuth(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=(\\d+)\\.([0-9a-f]{64})`));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || exp < nowSec()) return false;
  const sig = await hmacHex(env.COOKIE_SECRET, String(exp));
  return timingSafeEqual(sig, m[2]);
}

// 浏览器端写操作校验 Origin（配合 SameSite=Strict 双保险）；非浏览器请求（无 Origin）放行
export function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  const proto = new URL(request.url).protocol;
  if (origin !== `${proto}//${host}`) {
    throw new ApiError(403, "跨站请求被拒绝");
  }
}
