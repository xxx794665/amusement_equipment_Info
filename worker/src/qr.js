// 二维码 SVG 生成：qrcode-generator（MIT，见 vendor/qrcode.js 头部版权声明）。
// H 级纠错（印刷耐磨），4 模块静区，型号按内容长度自动升档。

import qrcode from "./vendor/qrcode.js";

const MODULE = 4; // 每模块像素（SVG 矢量，仅影响 viewBox 比例）
const MARGIN = 4; // 静区模块数

export function qrSvg(text) {
  let qr = null;
  for (let type = 1; type <= 40 && !qr; type++) {
    const cand = qrcode(type, "H");
    try {
      cand.addData(text);
      cand.make();
      qr = cand;
    } catch {
      // 内容超出当前型号容量，升档重试
    }
  }
  if (!qr) throw new Error("内容过长，无法生成二维码");
  const n = qr.getModuleCount();
  const dim = (n + MARGIN * 2) * MODULE;
  let path = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) {
        const px = (x + MARGIN) * MODULE;
        const py = (y + MARGIN) * MODULE;
        path += `M${px} ${py}h${MODULE}v${MODULE}h-${MODULE}z`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" ` +
    `width="${dim}" height="${dim}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}
