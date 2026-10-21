// 服务端渲染：展示页（复刻官方页，字段从设备记录填充）、设备列表首页、404 页。
// 展示页样式块逐字节来自 docs/motorcycle/index.html 的校准版本，勿改动。

import { escapeHtml } from "./util.js";
import { FIELDS, SLOTS, PAGE_TOP, PAGE_TITLE } from "./constants.js";

function htmlPage(body, title = PAGE_TITLE) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

const DISPLAY_STYLE = `/* ===== 官方页全局样式（按实测计算样式校准：body 无边距、字体走浏览器默认） ===== */
html {
  -ms-text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  overflow: hidden auto;
  font-size: 14px;
}
body {
  margin: 0;
  /* 官方页文字位于 Vuetify v-application 作用域，实际字体为 Roboto 回退栈 */
  font-family: Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
  background-color: #fff;
  height: 100%;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
/* 官方页全局隐藏滚动条（不占布局宽度） */
::-webkit-scrollbar { width: 0; height: 0; }

/* ===== scanningView 页面样式（摘自 sh.gegia.cn 123.8cefbdc4.css，去除 scoped 属性） ===== */
.scanningView .scanTop {
  height: 4rem;
  font-size: 1.2rem;
  background-color: #303f56;
  color: #fff;
  text-align: center;
  line-height: 4rem;
}
.scanningView .sContent { margin: 1rem 4%; }
.scanningView .sBox {
  border-bottom: 0.5rem solid #f0eff4;
  padding: 1rem 0;
}
.scanningView .sBox .sItem {
  font-size: 1rem;
  line-height: 2rem;
  display: flex;
}
.scanningView .sBox .sItem .sLeft { width: 8rem; }
.imgTitle {
  width: 100%;
  text-align: center;
  padding: 16px 0;
  box-sizing: border-box;
}
.imgItem { padding: 0 45px; }
.sRight { flex: 1; }
`;

export function renderDevicePage(device) {
  const fieldItem = (label, value) =>
    `<div class="sItem"><div class="sLeft">${label}:</div><div class="sRight">${escapeHtml(value)}</div></div>`;
  const basic = FIELDS.slice(0, 10)
    .map((f) => fieldItem(f.label, device[f.key]))
    .join("\n      ");
  const imgItems = SLOTS.map((s) => {
    const src = escapeHtml(device[s.key]);
    const img = src ? `<img style="width:100%" src="${src}" alt="">` : "";
    return `<div class="imgItem"><div class="imgTitle">${s.title}</div>${img}</div>`;
  }).join("\n    ");

  const body = `<!DOCTYPE html>
<html lang="">
<head>
<meta charset="utf-8">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${PAGE_TITLE}</title>
<link rel="icon" href="data:,">
<style>
${DISPLAY_STYLE}</style>
</head>
<body>
<div class="scanningView">
  <div class="scanTop">${PAGE_TOP}</div>
  <div class="sContent">
    <div class="sBox">
      ${basic}
    </div>
    <div class="sBox">
      ${fieldItem("游戏内容简介", device.game_intro)}
    </div>
    <div class="sBox">
      ${fieldItem("操作说明", device.instructions)}
    </div>
    ${imgItems}
  </div>
</div>
</body>
</html>`;
  return htmlPage(body);
}

export function renderListPage(devices) {
  const cards = devices
    .map(
      (d) => `  <a class="card" href="/d/${d.id}">
    <img src="${escapeHtml(d.img_front || "")}" alt="${escapeHtml(d.device_name)}">
    <div>
      <div class="name">${escapeHtml(d.device_name)}</div>
      <div class="meta">${escapeHtml(d.device_type)} · ${escapeHtml(d.approval_number)}</div>
    </div>
  </a>`,
    )
    .join("\n");
  const body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>游艺设备信息</title>
<link rel="icon" href="data:,">
<style>
html { font-family: "Helvetica Neue", Helvetica, STHeiTi, Arial, sans-serif; font-size: 14px; }
body { margin: 0; font-size: 14px; line-height: 1.5; color: #333; background-color: #f0eff4; }
.bar {
  height: 4rem;
  font-size: 1.2rem;
  background-color: #303f56;
  color: #fff;
  text-align: center;
  line-height: 4rem;
}
.list { padding: 1rem 4%; max-width: 40rem; margin: 0 auto; }
a.card {
  display: flex;
  gap: 1rem;
  align-items: center;
  background: #fff;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
  text-decoration: none;
  color: #333;
}
a.card img { width: 6rem; height: 6rem; object-fit: cover; border-radius: 4px; background: #fff; }
a.card .name { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.3rem; }
a.card .meta { font-size: 0.9rem; color: #777; }
</style>
</head>
<body>
<div class="bar">游艺设备信息</div>
<div class="list">
${cards || '<div style="background:#fff;border-radius:6px;padding:2rem;text-align:center;color:#777">暂无上架设备</div>'}
</div>
</body>
</html>`;
  return htmlPage(body, "游艺设备信息");
}

export function render404() {
  const body = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>404</title>
<link rel="icon" href="data:,">
<style>
html { font-family: "Helvetica Neue", Helvetica, STHeiTi, Arial, sans-serif; }
body { margin: 0; color: #333; background: #f0eff4; }
.tip { max-width: 30rem; margin: 6rem auto; background: #fff; border-radius: 8px;
  padding: 3rem 2rem; text-align: center; line-height: 2; }
.tip h1 { font-size: 1.6rem; margin: 0 0 1rem; }
</style>
</head>
<body>
<div class="tip">
  <h1>页面不存在</h1>
  <div>该设备信息可能已下架，或链接有误。</div>
</div>
</body>
</html>`;
  return new Response(body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
