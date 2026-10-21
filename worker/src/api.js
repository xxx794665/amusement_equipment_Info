// /api/* 路由：登录会话、设备 CRUD（含临时图片转存）、预填采集、图片上传、展示页设置、二维码 SVG

import { json, readJsonBody, ApiError } from "./util.js";
import {
  checkAuth,
  checkOrigin,
  verifyPassword,
  buildSessionCookie,
  clearCookie,
  clearLoginFails,
  checkLoginRate,
  recordLoginFail,
  clientIp,
} from "./auth.js";
import { listDevices, getDevice, createDevice, updateDevice, deleteDevice } from "./db.js";
import { getDisplaySettings, saveDisplaySettings } from "./settings.js";
import { saveTmpImage, presignTmpImage, commitTmpImages, validateImageValues, isR2TmpPath } from "./images.js";
import { ossTmpKeyFromUrl } from "./oss.js";
import { prefillFromOfficial } from "./prefill.js";
import { qrSvg } from "./qr.js";
import { SLOTS } from "./constants.js";

export async function handleApi(request, env, pathname) {
  const method = request.method;

  // ---- 公开端点 ----
  if (pathname === "/api/health") return json({ ok: true });

  const qr = pathname.match(/^\/api\/devices\/(\d+)\/qr\.svg$/);
  if (qr && method === "GET") {
    await getDevice(env.DB, qr[1]); // 不存在 → 404
    const target = new URL(request.url).origin + "/d/" + qr[1];
    return new Response(qrSvg(target), {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
    });
  }

  if (pathname === "/api/login" && method === "POST") {
    const ip = clientIp(request);
    checkLoginRate(ip);
    const body = await readJsonBody(request);
    if (typeof body.password !== "string" || !body.password) throw new ApiError(400, "缺少口令");
    if (await verifyPassword(body.password, env)) {
      clearLoginFails(ip);
      return json({ ok: true }, 200, { "set-cookie": await buildSessionCookie(request, env) });
    }
    recordLoginFail(ip);
    throw new ApiError(401, "口令错误");
  }

  if (pathname === "/api/logout") {
    return json({ ok: true }, 200, { "set-cookie": clearCookie(request) });
  }

  if (pathname === "/api/session" && method === "GET") {
    return json({ authed: await checkAuth(request, env) });
  }

  // ---- 以下端点均需登录 ----
  if (!(await checkAuth(request, env))) throw new ApiError(401, "未登录或会话已过期");
  if (method !== "GET") checkOrigin(request);

  if (pathname === "/api/devices" && method === "GET") {
    return json({ devices: await listDevices(env.DB, true) });
  }

  // 展示页设置（页面 title 与 scanTop 批准单位）：GET 返回生效值+默认值，空值保存=恢复默认
  if (pathname === "/api/settings" && method === "GET") {
    return json(await getDisplaySettings(env.DB));
  }
  if (pathname === "/api/settings" && (method === "PUT" || method === "PATCH")) {
    const body = await readJsonBody(request);
    await saveDisplaySettings(env.DB, body);
    return json(await getDisplaySettings(env.DB));
  }

  if (pathname === "/api/devices" && method === "POST") {
    const body = await readJsonBody(request);
    validateImageValues(body, env);
    // 先落库拿到 id（两种后端的临时图先置空），转存正式键后再补写图片字段
    const insertBody = { ...body };
    for (const s of SLOTS) {
      const v = insertBody[s.key];
      if (isR2TmpPath(v) || ossTmpKeyFromUrl(env, v)) insertBody[s.key] = "";
    }
    const id = await createDevice(env.DB, insertBody);
    const rewritten = await commitTmpImages(env, id, body);
    const imgPatch = {};
    for (const s of SLOTS) {
      if (rewritten[s.key] && rewritten[s.key] !== (insertBody[s.key] ?? "")) {
        imgPatch[s.key] = rewritten[s.key];
      }
    }
    if (Object.keys(imgPatch).length > 0) await updateDevice(env.DB, id, imgPatch);
    return json({ id });
  }

  const one = pathname.match(/^\/api\/devices\/(\d+)$/);
  if (one) {
    const id = one[1];
    if (method === "GET") return json({ device: await getDevice(env.DB, id) });
    if (method === "PUT" || method === "PATCH") {
      const body = await readJsonBody(request);
      validateImageValues(body, env);
      const rewritten = await commitTmpImages(env, id, body);
      await updateDevice(env.DB, id, rewritten);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await deleteDevice(env.DB, id);
      return json({ ok: true });
    }
    throw new ApiError(405, "不支持的请求方法");
  }

  if (pathname === "/api/prefill" && method === "POST") {
    const body = await readJsonBody(request);
    const result = await prefillFromOfficial(body.input);
    return json(result);
  }

  if (pathname === "/api/images" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    const slot = form.get("slot");
    const saved = await saveTmpImage(env, file, slot);
    return json(saved);
  }

  if (pathname === "/api/presign" && method === "POST") {
    // 阿里云 OSS 后端：返回预签名直传 URL（浏览器带相同 Content-Type 直传北京）
    const body = await readJsonBody(request);
    const saved = await presignTmpImage(env, body.slot, body.contentType, null);
    return json(saved);
  }

  throw new ApiError(404, "接口不存在");
}
