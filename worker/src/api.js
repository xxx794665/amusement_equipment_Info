// /api/* 路由：登录会话、设备 CRUD、预填采集、图片上传（直传最终键）、图片丢弃、二维码 SVG

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
import { saveImage, presignImage, validateImageValues, deleteRemovedImages, discardUnsavedImage } from "./images.js";
import { prefillFromOfficial } from "./prefill.js";
import { qrSvg } from "./qr.js";

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

  // 展示页设置（page_title / scan_top）已随设备记录单独维护：走 /api/devices 的增改接口

  // 上传即最终键（ADR-0005）：图片地址在选图时已就位，保存只剩 D1 写入
  if (pathname === "/api/devices" && method === "POST") {
    const body = await readJsonBody(request);
    validateImageValues(body, env);
    const id = await createDevice(env.DB, body);
    return json({ id });
  }

  const one = pathname.match(/^\/api\/devices\/(\d+)$/);
  if (one) {
    const id = one[1];
    if (method === "GET") return json({ device: await getDevice(env.DB, id) });
    if (method === "PUT" || method === "PATCH") {
      const body = await readJsonBody(request);
      validateImageValues(body, env);
      const before = await getDevice(env.DB, id); // 旧行（不存在 → 404）
      await updateDevice(env.DB, id, body);
      // best-effort 清理被移除的旧图对象：查库确认全站无引用才删，失败不影响保存结果
      await deleteRemovedImages(env, env.DB, before, body);
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
    const saved = await saveImage(env, file, slot);
    return json(saved);
  }

  if (pathname === "/api/images/discard" && method === "POST") {
    // 删除刚上传、尚未保存入库的图片（服务端查库确认无引用才删；幂等）
    const body = await readJsonBody(request);
    return json(await discardUnsavedImage(env, env.DB, body.path));
  }

  if (pathname === "/api/presign" && method === "POST") {
    // 阿里云 OSS 后端：返回预签名直传 URL（浏览器带相同 Content-Type 直传北京）
    const body = await readJsonBody(request);
    const saved = await presignImage(env, body.slot, body.contentType, null);
    return json(saved);
  }

  throw new ApiError(404, "接口不存在");
}
