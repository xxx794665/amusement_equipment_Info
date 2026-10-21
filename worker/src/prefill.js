// 预填采集：解析运营方粘贴的官方页链接，向固定官方域名拉取字段。
// 安全约束：绝不请求用户提供的任意 URL——只接受能解析出纯数字 id 的三种输入
// （scanningView 页面链接 / 裸 id / scanProjectQRCode API 链接），
// 实际请求地址恒为 https://sh.gegia.cn/api/notice/door/scanProjectQRCode/<id>。

import { ApiError } from "./util.js";
import { FIELDS } from "./constants.js";

const OFFICIAL_API = "https://sh.gegia.cn/api/notice/door/scanProjectQRCode/";

export function parseOfficialId(input) {
  const s = String(input || "").trim();
  const m =
    s.match(/scanningView\?id=(\d+)/) ||
    s.match(/scanProjectQRCode\/(\d+)/) ||
    (/^\d{1,10}$/.test(s) ? [null, s] : null);
  return m ? m[1] : null;
}

export async function prefillFromOfficial(input) {
  const officialId = parseOfficialId(input);
  if (!officialId) {
    throw new ApiError(400, "无法识别官方链接：请粘贴 scanningView 页面链接、API 链接或纯数字 id");
  }
  let res;
  try {
    res = await fetch(`${OFFICIAL_API}${officialId}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(502, "官方接口访问失败（超时或网络不通），请改为手动填写");
  }
  if (!res.ok) throw new ApiError(502, `官方接口返回 ${res.status}，请改为手动填写`);
  let body;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(502, "官方接口返回了非 JSON 内容，请改为手动填写");
  }
  if (body.code !== 200 || !body.data) {
    throw new ApiError(502, "官方接口返回数据异常，请改为手动填写");
  }
  const d = body.data;
  const nd = body.data.newData || {};
  const fields = {};
  for (const f of FIELDS) {
    let v = d[f.api];
    if (v == null && f.api2) v = nd[f.api2];
    fields[f.key] = v == null ? "" : String(v);
  }
  return { officialId, fields };
}
