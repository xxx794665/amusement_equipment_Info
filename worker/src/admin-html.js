// 管理端单页应用（由 Worker 直接返回，无外部 CDN 依赖，国内可直连）。
// 注意：内嵌 <script> 一律不用模板字符串，避免与本文件的 JS 模板字面量转义冲突。

import { FIELDS, SLOTS, DISPLAY_SETTINGS } from "./constants.js";

export function adminHtml() {
  const fieldsJson = JSON.stringify(FIELDS);
  const slotsJson = JSON.stringify(SLOTS);
  const displayJson = JSON.stringify(DISPLAY_SETTINGS);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>设备管理 · 游艺设备信息</title>
<link rel="icon" href="data:,">
<style>
html { font-family: "Helvetica Neue", Helvetica, STHeiTi, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; font-size: 14px; }
body { margin: 0; background: #f0eff4; color: #333; }
.bar { height: 4rem; font-size: 1.2rem; background: #303f56; color: #fff; display: flex;
  align-items: center; justify-content: space-between; padding: 0 1rem; box-sizing: border-box; }
.bar button { background: transparent; border: 1px solid rgba(255,255,255,.5); color: #fff;
  border-radius: 4px; padding: .3rem .8rem; font-size: .9rem; cursor: pointer; }
.wrap { max-width: 40rem; margin: 0 auto; padding: 1rem 4%; }
.card { background: #fff; border-radius: 8px; padding: 1.2rem; margin-bottom: 1rem; }
h2 { font-size: 1.2rem; margin: .2rem 0 1rem; }
h3 { font-size: 1rem; margin: 0 0 .8rem; color: #303f56; }
input[type=text], input[type=password], textarea {
  width: 100%; box-sizing: border-box; border: 1px solid #d5d8de; border-radius: 6px;
  padding: .5rem .7rem; font: inherit; margin-bottom: .8rem; background: #fff; }
textarea { min-height: 6rem; resize: vertical; }
.frow { display: flex; margin-bottom: .8rem; }
.frow label { width: 8.5rem; flex: none; line-height: 2.1; color: #555; }
.frow input, .frow textarea { margin: 0; }
.frow textarea { flex: 1; }
button.primary { background: #303f56; color: #fff; border: none; border-radius: 6px;
  padding: .6rem 1.2rem; font-size: 1rem; cursor: pointer; }
button.plain { background: #eef0f4; color: #303f56; border: none; border-radius: 6px;
  padding: .45rem .8rem; font-size: .9rem; cursor: pointer; margin-right: .5rem; }
button.big { width: 100%; padding: .8rem; font-size: 1.05rem; margin-top: .5rem; }
.error { color: #c0392b; margin: .4rem 0; min-height: 1.2em; }
.ok { color: #1e8449; }
.dev-row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; }
.dev-row .name { font-weight: 700; }
.dev-row .meta { color: #777; font-size: .9rem; flex: 1 1 100%; }
.pill { font-size: .8rem; border-radius: 99px; padding: .15rem .6rem; }
.pill.on { background: #e8f6ef; color: #1e8449; }
.pill.off { background: #fbeaea; color: #c0392b; }
.slot-box { border: 1px solid #e4e6eb; border-radius: 8px; padding: .8rem; margin-bottom: .8rem; }
.slot-box .t { font-weight: 700; margin-bottom: .5rem; }
.slot-box img { max-width: 100%; max-height: 140px; border-radius: 4px; display: block;
  margin-bottom: .5rem; background: #f6f7f9; }
.slot-box .hint { font-size: .85rem; color: #777; }
.slot-box .badge { display: inline-block; font-size: .8rem; background: #fdf3d7; color: #9a7d0a;
  border-radius: 4px; padding: .1rem .5rem; margin-left: .5rem; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex;
  align-items: center; justify-content: center; z-index: 10; padding: 1rem; }
.modal-box { background: #fff; border-radius: 10px; padding: 1.5rem; max-width: 26rem;
  width: 100%; text-align: center; box-sizing: border-box; }
.modal-box img { width: 14rem; max-width: 100%; margin: .8rem auto; display: block; }
.modal-box .url { word-break: break-all; color: #555; margin-bottom: 1rem; font-size: .9rem; }
.modal-box button { margin: .25rem; }
.login-box { max-width: 22rem; margin: 4rem auto; }
#toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: #303f56;
  color: #fff; border-radius: 6px; padding: .6rem 1.2rem; opacity: 0; transition: opacity .25s;
  pointer-events: none; z-index: 20; }
</style>
</head>
<body>
<div class="bar"><span>游艺设备信息 · 管理端</span><button id="btn-logout">退出登录</button></div>

<div id="view-login" class="wrap">
  <div class="card login-box">
    <h2>管理员登录</h2>
    <input type="password" id="login-password" placeholder="管理口令" autocomplete="current-password">
    <div id="login-error" class="error"></div>
    <button id="btn-login" class="primary big">登录</button>
  </div>
</div>

<div id="view-list" class="wrap" style="display:none">
  <div class="card">
    <button id="btn-new" class="primary">＋ 新增设备</button>
    <div id="device-rows"></div>
    <div id="list-error" class="error"></div>
  </div>
</div>

<div id="view-form" class="wrap" style="display:none">
  <div class="card">
    <button id="btn-back" class="plain">← 返回列表</button>
    <h2 id="form-title">新增设备</h2>

    <h3>从官方页采集（选填）</h3>
    <input type="text" id="official-input" placeholder="粘贴官方 scanningView 页面链接 / API 链接 / 纯数字 id">
    <button id="btn-prefill" class="plain">采集预填</button>
    <div id="prefill-msg" class="error"></div>

    <h3 style="margin-top:1.2rem">基础信息</h3>
    <div id="field-rows"></div>
    <label style="display:block;margin-bottom:1rem">
      <input type="checkbox" id="f-enabled"> 启用（上架：展示页可访问；下架：扫码返回 404）
    </label>

    <h3>展示页面设置（本设备单独保存）</h3>
    <div id="display-rows"></div>
    <div style="font-size:.85rem;color:#777;margin:0 0 1.2rem">
      页面标题 = 展示页浏览器标签页 title；批准单位 = 展示页顶部深色横条（scanTop）文字。
      留空即用默认文案；保存后仅本设备展示页下次打开生效，二维码不用换。
    </div>

    <h3>图片栏位（选图后立即上传，点“保存”后生效）</h3>
    <div class="frow">
      <label>图片存储</label>
      <div style="flex:1">
        <select id="img-backend" style="width:100%;box-sizing:border-box;padding:.45rem;border:1px solid #d5d8de;border-radius:6px;font:inherit;background:#fff">
          <option value="oss">阿里云 OSS（国内访问快）</option>
          <option value="r2">CF R2（站内 /img/ 路径）</option>
        </select>
      </div>
    </div>
    <div id="slot-rows"></div>

    <div id="save-error" class="error"></div>
    <button id="btn-save" class="primary big">保存</button>
  </div>
</div>

<div id="qr-modal" class="modal" style="display:none">
  <div class="modal-box">
    <h3>保存成功</h3>
    <img id="qr-img" alt="页面访问二维码">
    <div id="qr-url" class="url"></div>
    <button id="btn-copy" class="plain">复制链接</button>
    <button id="btn-dl-png" class="primary">下载 PNG</button>
    <button id="btn-dl-svg" class="plain">下载 SVG</button><br>
    <button id="btn-qr-close" class="plain" style="margin-top:.8rem">返回继续管理</button>
  </div>
</div>

<div id="toast"></div>

<script>
var FIELDS = ${fieldsJson};
var SLOTS = ${slotsJson};
var DISPLAY_SETTINGS = ${displayJson};
var state = { device: null, qrId: null };

function $(id) { return document.getElementById(id); }
function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

function api(method, path, body, isForm) {
  var opts = { method: method, headers: {} };
  if (body !== undefined && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body;
  }
  return fetch(path, opts).then(function (res) {
    return res.json().catch(function () { return {}; }).then(function (data) {
      if (!res.ok) { throw new Error(data.error || ('HTTP ' + res.status)); }
      return data;
    });
  });
}

function show(view) {
  ['view-login', 'view-list', 'view-form'].forEach(function (v) { $(v).style.display = 'none'; });
  $(view).style.display = 'block';
}

function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.style.opacity = '1';
  setTimeout(function () { t.style.opacity = '0'; }, 2200);
}

// ---------- 登录 ----------
function doLogin() {
  var pwd = $('login-password').value;
  if (!pwd) { $('login-error').textContent = '请输入口令'; return; }
  $('btn-login').disabled = true;
  api('POST', '/api/login', { password: pwd }).then(function () {
    $('login-error').textContent = '';
    enterList();
  }).catch(function (e) {
    $('login-error').textContent = e.message;
  }).finally(function () { $('btn-login').disabled = false; });
}

// ---------- 设备列表 ----------
function enterList() { loadDevices(); show('view-list'); }

function loadDevices() {
  $('list-error').textContent = '';
  api('GET', '/api/devices').then(function (d) {
    var box = $('device-rows');
    box.innerHTML = '';
    (d.devices || []).forEach(function (dev) {
      var row = document.createElement('div');
      row.className = 'dev-row';
      row.style.cssText = 'border-bottom:1px solid #eee;padding:.8rem 0';
      row.innerHTML =
        '<span class="name">' + esc(dev.device_name || ('设备 ' + dev.id)) + '</span>' +
        '<span class="pill ' + (dev.enabled ? 'on">上架中' : 'off">已下架') + '</span>' +
        '<button class="plain" data-act="edit">编辑</button>' +
        '<button class="plain" data-act="toggle">' + (dev.enabled ? '下架' : '上架') + '</button>' +
        '<button class="plain" data-act="del">删除</button>' +
        '<div class="meta">#' + dev.id + ' · ' + esc(dev.device_type) + ' · ' + esc(dev.approval_number) +
        ' · 更新于 ' + esc(dev.updated_at) + '</div>';
      row.addEventListener('click', function (ev) {
        var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
        if (act === 'edit') openEdit(dev.id);
        if (act === 'toggle') toggleEnabled(dev.id, dev.enabled);
        if (act === 'del') removeDevice(dev);
      });
      box.appendChild(row);
    });
  }).catch(function (e) { $('list-error').textContent = e.message; });
}

function toggleEnabled(id, enabled) {
  api('PUT', '/api/devices/' + id, { enabled: !enabled }).then(loadDevices)
    .catch(function (e) { toast(e.message); });
}

function removeDevice(dev) {
  if (!confirm('确认删除设备「' + (dev.device_name || dev.id) + '」？删除后展示页立即 404，不可恢复（图片文件保留）。')) return;
  api('DELETE', '/api/devices/' + dev.id).then(loadDevices)
    .catch(function (e) { toast(e.message); });
}

// ---------- 表单 ----------
function openCreate() {
  state.device = { enabled: 1 };
  FIELDS.forEach(function (f) { state.device[f.key] = ''; });
  SLOTS.forEach(function (s) { state.device[s.key] = ''; });
  DISPLAY_SETTINGS.forEach(function (f) { state.device[f.key] = ''; });
  renderForm();
  show('view-form');
}

function openEdit(id) {
  api('GET', '/api/devices/' + id).then(function (d) {
    state.device = d.device;
    renderForm();
    show('view-form');
  }).catch(function (e) { toast(e.message); });
}

function renderForm() {
  var isNew = !state.device.id;
  $('form-title').textContent = isNew ? '新增设备' : ('编辑设备 #' + state.device.id);
  $('official-input').value = state.device.source_official_id || '';
  $('prefill-msg').textContent = '';
  $('save-error').textContent = '';

  var fbox = $('field-rows');
  fbox.innerHTML = '';
  FIELDS.forEach(function (f) {
    var long = f.key === 'game_intro' || f.key === 'instructions';
    var row = document.createElement('div');
    row.className = 'frow';
    row.innerHTML = '<label>' + esc(f.label) + '</label>';
    var input = document.createElement(long ? 'textarea' : 'input');
    if (!long) { input.type = 'text'; }
    input.value = state.device[f.key] || '';
    input.addEventListener('input', function () { state.device[f.key] = input.value; });
    row.appendChild(input);
    fbox.appendChild(row);
  });
  $('f-enabled').checked = !!state.device.enabled;

  var dbox = $('display-rows');
  dbox.innerHTML = '';
  DISPLAY_SETTINGS.forEach(function (f) {
    var row = document.createElement('div');
    row.className = 'frow';
    row.innerHTML = '<label>' + esc(f.label) + '</label>';
    var input = document.createElement('input');
    input.type = 'text';
    input.value = state.device[f.key] || '';
    input.placeholder = '留空默认：' + f.default;
    input.maxLength = f.maxLength;
    input.title = f.hint;
    input.addEventListener('input', function () { state.device[f.key] = input.value; });
    row.appendChild(input);
    dbox.appendChild(row);
  });

  var sbox = $('slot-rows');
  sbox.innerHTML = '';
  SLOTS.forEach(function (s) {
    var box = document.createElement('div');
    box.className = 'slot-box';
    box.innerHTML = '<div class="t">' + esc(s.title) + '</div>';
    var img = document.createElement('img');
    img.style.display = state.device[s.key] ? 'block' : 'none';
    if (state.device[s.key]) { img.src = state.device[s.key]; }
    var file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp';
    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = state.device[s.key] ? '已使用上图；重新选择将覆盖' : '尚未上传';
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      uploadSlot(s, file.files[0], img, hint);
    });
    box.appendChild(img);
    box.appendChild(file);
    box.appendChild(hint);
    sbox.appendChild(box);
  });
}

function uploadSlot(s, file, img, hint) {
  var backend = $('img-backend').value;
  hint.textContent = '上传中…';
  if (backend === 'oss') {
    // 阿里云 OSS：先取预签名 URL，浏览器带签名 Content-Type 直传北京
    api('POST', '/api/presign', { slot: s.slot, contentType: file.type }).then(function (d) {
      return fetch(d.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        .then(function (res) {
          if (!res.ok) { throw new Error('OSS 直传失败 HTTP ' + res.status); }
          return d.path;
        });
    }).then(function (path) {
      state.device[s.key] = path;
      img.src = path;
      img.style.display = 'block';
      hint.innerHTML = '已上传<span class="badge">点“保存”后生效</span>';
    }).catch(function (e) {
      hint.textContent = '上传失败：' + e.message + '（可改选 CF R2 后重选图片）';
    });
    return;
  }
  var fd = new FormData();
  fd.append('file', file);
  fd.append('slot', s.slot);
  api('POST', '/api/images', fd, true).then(function (d) {
    state.device[s.key] = d.path;
    img.src = d.path;
    img.style.display = 'block';
    hint.innerHTML = '已上传<span class="badge">点“保存”后生效</span>';
  }).catch(function (e) {
    hint.textContent = '上传失败：' + e.message;
  });
}

function doPrefill() {
  var input = $('official-input').value.trim();
  if (!input) { $('prefill-msg').textContent = '请先粘贴官方链接或输入 id'; return; }
  $('prefill-msg').textContent = '采集中…';
  $('btn-prefill').disabled = true;
  api('POST', '/api/prefill', { input: input }).then(function (d) {
    FIELDS.forEach(function (f) {
      if (typeof d.fields[f.key] === 'string') { state.device[f.key] = d.fields[f.key]; }
    });
    state.device.source_official_id = d.officialId;
    $('official-input').value = d.officialId;
    $('prefill-msg').textContent = '';
    renderForm();
    toast('已按官方数据预填，可逐项修改');
  }).catch(function (e) {
    $('prefill-msg').textContent = e.message + '（可直接手动填写）';
  }).finally(function () { $('btn-prefill').disabled = false; });
}

function saveDevice() {
  var d = state.device;
  d.enabled = $('f-enabled').checked ? 1 : 0;
  if (!d.device_name) { $('save-error').textContent = '设备名称必填'; return; }
  $('btn-save').disabled = true;
  $('save-error').textContent = '保存中…';
  var isNew = !d.id;
  api(isNew ? 'POST' : 'PUT', isNew ? '/api/devices' : ('/api/devices/' + d.id), d)
    .then(function (res) {
      if (isNew) { d.id = res.id; }
      $('save-error').textContent = '';
      showQr(d.id);
    })
    .catch(function (e) { $('save-error').textContent = e.message; })
    .finally(function () { $('btn-save').disabled = false; });
}

// ---------- 二维码 ----------
function showQr(id) {
  state.qrId = id;
  $('qr-img').src = '/api/devices/' + id + '/qr.svg';
  $('qr-url').textContent = location.origin + '/d/' + id;
  $('qr-modal').style.display = 'flex';
}

function download(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function dlSvg() {
  fetch('/api/devices/' + state.qrId + '/qr.svg').then(function (r) { return r.text(); })
    .then(function (t) {
      download(new Blob([t], { type: 'image/svg+xml' }), 'device-' + state.qrId + '-qr.svg');
    });
}

function dlPng() {
  var img = new Image();
  img.onload = function () {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 1024;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.drawImage(img, 0, 0, 1024, 1024);
    c.toBlob(function (blob) {
      if (blob) { download(blob, 'device-' + state.qrId + '-qr.png'); }
    }, 'image/png');
  };
  img.src = '/api/devices/' + state.qrId + '/qr.svg';
}

// ---------- 事件绑定与启动 ----------
try { var savedBackend = localStorage.getItem('img-backend'); if (savedBackend) { $('img-backend').value = savedBackend; } } catch (e) {}
$('img-backend').addEventListener('change', function () {
  try { localStorage.setItem('img-backend', $('img-backend').value); } catch (e) {}
});
$('btn-login').addEventListener('click', doLogin);
$('login-password').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
$('btn-logout').addEventListener('click', function () {
  api('POST', '/api/logout', {}).finally(function () { location.reload(); });
});
$('btn-new').addEventListener('click', openCreate);
$('btn-back').addEventListener('click', enterList);
$('btn-prefill').addEventListener('click', doPrefill);
$('btn-save').addEventListener('click', saveDevice);
$('btn-qr-close').addEventListener('click', function () { $('qr-modal').style.display = 'none'; enterList(); });
$('btn-copy').addEventListener('click', function () {
  var url = $('qr-url').textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { toast('已复制'); });
  } else { prompt('请手动复制：', url); }
});
$('btn-dl-png').addEventListener('click', dlPng);
$('btn-dl-svg').addEventListener('click', dlSvg);

api('GET', '/api/session').then(function (d) {
  if (d.authed) { enterList(); } else { show('view-login'); }
}).catch(function () { show('view-login'); });
</script>
</body>
</html>`;
}
