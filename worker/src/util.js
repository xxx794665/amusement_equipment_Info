// 通用工具：HTML 转义、JSON 响应、随机 id、恒时比较、错误类型

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export async function readJsonBody(request, maxBytes = 1024 * 1024) {
  const raw = await request.text();
  if (raw.length > maxBytes) throw new ApiError(413, "请求体过大");
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "请求体不是合法 JSON");
  }
}

export function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function nowSec() {
  return Math.floor(Date.now() / 1000);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
