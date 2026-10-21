// 入口路由：/ 设备列表 · /d/<id> 展示页 · /img/* R2 图片 · /admin 管理端 · /api/* 接口

import { ApiError, json } from "./util.js";
import { renderDevicePage, renderListPage, render404 } from "./render.js";
import { listDevices } from "./db.js";
import { serveImage } from "./images.js";
import { adminHtml } from "./admin-html.js";
import { handleApi } from "./api.js";

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      return json({ error: "服务器内部错误" }, 500);
    }
  },
};

async function route(request, env) {
  const { pathname: path, origin } = new URL(request.url);
  const method = request.method;

  if (path === "/" && method === "GET") {
    return renderListPage(await listDevices(env.DB, false));
  }

  if ((path === "/admin" || path === "/admin/") && method === "GET") {
    return new Response(adminHtml(), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const m = path.match(/^\/d\/(\d+)\/?$/);
  if (m && method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM devices WHERE id = ?").bind(Number(m[1])).first();
    if (!row || !row.enabled) return render404();
    return renderDevicePage(row);
  }

  if (path.startsWith("/img/")) {
    return serveImage(env, path.slice("/img/".length), request);
  }

  if (path.startsWith("/api/")) {
    return handleApi(request, env, path);
  }

  return render404();
}
