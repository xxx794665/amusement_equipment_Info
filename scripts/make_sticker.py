"""游戏游艺设备电子标识贴纸 & 二维码生成器。

依据《游戏游艺设备电子标识组成规则及打印标准》（附件3，见仓库根 W020201125394256024235.docx）：
  - 贴纸整体 80mm×40mm（亚银PET标签纸）
  - 标题"游戏游艺设备电子标识" 24pt 方正小标宋（简体）；10 字在 80mm 内放不下 24pt 时
    按宽度等比微缩（物理约束，视觉与 24pt 无差）
  - 字段（设备类别/设备名称/批准文号/监督电话）统一 16pt；任一字段过长时全组降到
    12pt 并按中文排版规则回行（闭合标点不起行、避免孤字），对应规范
    "设备名称过长时，可回行处理，字号缩小为12pt"
  - 二维码 24mm×24mm（含 4 模块静区，模块按浮点边界绘制保证物理尺寸精确），
    H 级纠错（贴设备上防磨损）

输出（默认写入 输出/ 目录）：
  qr.png      独立二维码图（PNG，DPI 元数据保证物理尺寸精确 24×24mm）
  qr.svg      独立二维码图（纯矢量，物理尺寸 24×24mm）
  sticker.png 整张贴纸（PNG，默认 600DPI）
  sticker.svg 整张贴纸（矢量文本 + 矢量二维码，物理尺寸 80×40mm）

字体：方正小标宋为商业字体不随仓库分发。PNG 渲染优先查找本机已安装的
方正小标宋；找不到时回退 SimSun（宋体）并加描边模拟粗宋（视觉接近小标宋）。
SVG 使用字体栈（装有该字体的机器上可完美渲染），但回行断点是按 SimSun 度量
预计算的，装有不同字体的查看器可能轻微溢出——打印以 PNG 母版为准。

用法（默认参数即摩托车设备）：
  python scripts/make_sticker.py
  python scripts/make_sticker.py --url https://... --name "设备名" --approval "粤游艺审〔20xx〕xxx号" --out 输出
"""
from __future__ import annotations

import argparse
import glob
import os
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

MM_PER_PT = 25.4 / 72.0

# SVG 用的字体栈：装有方正小标宋的机器精确渲染，否则回退宋体
FONT_STACK = "'FZXiaoBiaoSong-B05S','方正小标宋简体','FZXiaoBiaoSong',SimSun,'宋体',serif"

# PNG 渲染字体查找顺序（方正小标宋若本机有则优先）
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\FZXiaoBiaoSong-B05S.TTF",
    r"C:\Windows\Fonts\FZXiaoBiaoSong_GBK.TTF",
    r"C:\Windows\Fonts\FZXBSJW.TTF",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\FZXiaoBiaoSong-B05S.TTF"),
    r"C:\Windows\Fonts\simsun.ttc",
]

# 中文排版禁则：这些字符不能出现在行首（闭合标点）
NO_LINE_START = '〕〉》」』）】，。、；：？！…—%"”’'


# ---------------- 二维码 ----------------

def qr_matrix(data: str, border: int = 4) -> list[list[bool]]:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=border, box_size=1)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.get_matrix()  # 含四周静区


def modules_path(matrix: list[list[bool]]) -> str:
    parts = []
    for r, row in enumerate(matrix):
        for c, dark in enumerate(row):
            if dark:
                parts.append(f"M{c} {r}h1v1h-1z")
    return "".join(parts)


def write_qr_svg(matrix: list[list[bool]], path: Path, size_mm: float = 24.0) -> None:
    n = len(matrix)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size_mm:g}mm" height="{size_mm:g}mm" '
        f'viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
        f'<rect width="{n}" height="{n}" fill="#ffffff"/>'
        f'<path fill="#000000" d="{modules_path(matrix)}"/>'
        f"</svg>"
    )
    path.write_text(svg, encoding="utf-8")


def draw_qr_exact(draw: ImageDraw.ImageDraw, matrix: list[list[bool]],
                  x_px: float, y_px: float, total_px: int) -> None:
    """浮点模块边界绘制：n 个模块铺满 total_px，保证物理尺寸精确（模块交替 11/12px）。"""
    n = len(matrix)
    for r, row in enumerate(matrix):
        y0 = y_px + round(r * total_px / n)
        y1 = y_px + round((r + 1) * total_px / n) - 1
        if y1 < y0:
            continue
        for c, dark in enumerate(row):
            if dark:
                x0 = x_px + round(c * total_px / n)
                x1 = x_px + round((c + 1) * total_px / n) - 1
                if x1 >= x0:
                    draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))


def write_qr_png(matrix: list[list[bool]], path: Path, size_mm: float, dpi: int) -> None:
    total = round(size_mm / 25.4 * dpi)
    img = Image.new("RGB", (total, total), (255, 255, 255))
    draw_qr_exact(ImageDraw.Draw(img), matrix, 0, 0, total)
    img.save(path, "PNG", dpi=(dpi, dpi))


# ---------------- 字体 ----------------

def load_font(px: int) -> ImageFont.FreeTypeFont:
    patterns = [p for pat in (r"C:\Windows\Fonts\*小标宋*.ttf",
                              os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\*小标宋*.ttf"))
                for p in glob.glob(pat)]
    for cand in FONT_CANDIDATES + patterns:
        try:
            return ImageFont.truetype(cand, px)
        except OSError:
            continue
    raise SystemExit("未找到可用中文字体（simsun.ttc），无法渲染贴纸")


def text_width_mm(text: str, pt: float, probe: ImageFont.FreeTypeFont) -> float:
    """用探针字号测量文本宽度，换算为指定 pt 对应的毫米宽。"""
    return probe.getlength(text) * (pt * MM_PER_PT) / probe.size


# ---------------- 回行排版 ----------------

OPEN_BRACKETS = "〔（【《「『("
CLOSE_BRACKETS = "〕）】》」』)"


def tokenize(text: str) -> list[str]:
    """拆成排版原子：单个CJK字符 / 括号组(含内容整体) / 连续数字字母串。"""
    atoms: list[str] = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch in OPEN_BRACKETS:
            j, depth = i + 1, 1
            while j < len(text) and depth:
                if text[j] in OPEN_BRACKETS:
                    depth += 1
                elif text[j] in CLOSE_BRACKETS:
                    depth -= 1
                j += 1
            atoms.append(text[i:j])
            i = j
        elif ch.isascii() and ch.isalnum():
            j = i
            while j < len(text) and text[j].isascii() and text[j].isalnum():
                j += 1
            atoms.append(text[i:j])
            i = j
        else:
            atoms.append(ch)
            i += 1
    return atoms


def _glue(atoms: list[str]) -> list[str]:
    """粘连：括号组 + 紧随数字串 + 紧随单个CJK字 合成一个原子（如〔2023〕803号）。"""
    merged: list[str] = []
    i = 0
    while i < len(atoms):
        a = atoms[i]
        if a and a[0] in OPEN_BRACKETS:
            j = i + 1
            if j < len(atoms) and atoms[j].isdigit():
                j += 1
                if (j < len(atoms) and len(atoms[j]) == 1
                        and not (atoms[j].isascii() and atoms[j].isalnum())):
                    j += 1
            merged.append("".join(atoms[i:j]))
            i = j
        else:
            merged.append(a)
            i += 1
    return merged


def wrap_text(text: str, pt: float, max_mm: float, probe: ImageFont.FreeTypeFont) -> list[str]:
    """原子化回行：括号组/数字串不拆分，闭合标点不起行，末行避免单字孤行。"""
    if text_width_mm(text, pt, probe) <= max_mm:
        return [text]
    atoms = _glue(tokenize(text))
    lines: list[str] = []
    cur: list[str] = []
    for a in atoms:
        if cur and text_width_mm("".join(cur) + a, pt, probe) > max_mm:
            if a[0] in NO_LINE_START and cur:
                # 标点不能起行：把当前行最后一个原子带下去
                carry = cur[-1]
                lines.append("".join(cur[:-1]))
                cur = [carry, a]
            else:
                lines.append("".join(cur))
                cur = [a]
        else:
            cur.append(a)
    if cur:
        lines.append("".join(cur))
    # 孤字处理：末行只有 1 字符且上一行超过 2 字符时，匀一个下来
    if len(lines) >= 2 and len(lines[-1]) == 1 and len(lines[-2]) > 2:
        lines[-1] = lines[-2][-1] + lines[-1]
        lines[-2] = lines[-2][:-1]
    return [l for l in lines if l]


def choose_field_layout(field_texts: list[str], col_max: float, content_h: float,
                        probe: ImageFont.FreeTypeFont) -> tuple[float, list[str], float]:
    """统一字段字号：16pt 全部单行放得下用 16pt；否则依次尝试 12pt 及以下回行方案。

    返回 (pt, 行列表, 行高 mm)。行高 = 字高 + 0.55mm 间隙，保证行行分明。
    """
    if all(text_width_mm(t, 16.0, probe) <= col_max for t in field_texts):
        fs = 16.0 * MM_PER_PT
        return 16.0, list(field_texts), fs + 0.55
    for pt in (12.0, 11.5, 11.0, 10.5, 10.0):
        lines: list[str] = []
        for t in field_texts:
            lines.extend(wrap_text(t, pt, col_max, probe))
        fs = pt * MM_PER_PT
        line_h = fs + 0.55
        if len(lines) * line_h <= content_h:
            return pt, lines, line_h
    # 兜底：10pt 仍放不下则压缩行距（极限情况）
    pt = 10.0
    lines = []
    for t in field_texts:
        lines.extend(wrap_text(t, pt, col_max, probe))
    fs = pt * MM_PER_PT
    line_h = min(fs + 0.55, content_h / max(1, len(lines)))
    return pt, lines, line_h


# ---------------- 贴纸布局 ----------------

def build_layout(args, probe: ImageFont.FreeTypeFont):
    """返回排版结果。单位 mm，坐标系 80×40。

    结构（对照官方电子标识样式）：标题居中占上部约 1/4；下方左栏四字段、
    右栏 24×24mm 二维码与字段块垂直对齐。
    """
    w, h = args.sticker_w, args.sticker_h
    margin = 1.8
    # 标题：24pt 基准，超宽等比微缩（80mm 贴纸放 10 个 24pt 字物理上略超）
    title_pt = args.title_pt
    max_title_w = w - 2 * margin
    tw = text_width_mm(args.title, title_pt, probe)
    if tw > max_title_w:
        title_pt = title_pt * max_title_w / tw
    title_h = title_pt * MM_PER_PT * 1.15
    title_cy = margin + title_h / 2

    content_top = margin + title_h + 1.0
    content_bottom = h - 1.2
    content_h = content_bottom - content_top

    # 二维码：右侧 24×24mm，在内容区垂直居中
    qr_size = args.qr_size
    qr_x = w - margin - qr_size
    qr_y = content_top + (content_h - qr_size) / 2

    # 字段列：左侧，右边界距二维码 1mm
    col_max = qr_x - 1.0 - margin
    field_texts = [f"设备类别:{args.category}", f"设备名称:{args.name}",
                   f"批准文号:{args.approval}", f"监督电话:{args.phone}"]
    field_pt, lines, line_h = choose_field_layout(field_texts, col_max, content_h, probe)
    # 字段块在内容区顶部起排，留 0.3mm 起始缓冲
    fields_y = content_top + 0.3

    return {
        "title_pt": title_pt, "title_cy": title_cy,
        "field_pt": field_pt, "lines": lines, "line_h": line_h, "fields_y": fields_y,
        "qr": (qr_x, qr_y, qr_size), "margin": margin,
        "col_max": col_max, "content_h": content_h,
    }


# ---------------- 贴纸 SVG ----------------

def write_sticker_svg(matrix, args, probe: ImageFont.FreeTypeFont, path: Path) -> None:
    lay = build_layout(args, probe)
    n = len(matrix)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{args.sticker_w:g}mm" height="{args.sticker_h:g}mm" '
        f'viewBox="0 0 {args.sticker_w:g} {args.sticker_h:g}">',
        f'<rect width="{args.sticker_w:g}" height="{args.sticker_h:g}" fill="#ffffff"/>',
    ]
    ts = lay["title_pt"] * MM_PER_PT
    parts.append(
        f'<text x="{args.sticker_w / 2:g}" y="{lay["title_cy"] + ts * 0.35:g}" font-size="{ts:g}" '
        f'font-family="{FONT_STACK}" font-weight="bold" text-anchor="middle" '
        f'fill="#000000">{args.title}</text>'
    )
    fs = lay["field_pt"] * MM_PER_PT
    y = lay["fields_y"]
    for line in lay["lines"]:
        parts.append(
            f'<text x="{lay["margin"]:g}" y="{y + fs * 0.86:g}" font-size="{fs:g}" '
            f'font-family="{FONT_STACK}" font-weight="bold" fill="#000000">{line}</text>'
        )
        y += lay["line_h"]
    qr_x, qr_y, qr_size = lay["qr"]
    parts.append(
        f'<svg x="{qr_x:g}" y="{qr_y:g}" width="{qr_size:g}" height="{qr_size:g}" '
        f'viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
        f'<rect width="{n}" height="{n}" fill="#ffffff"/>'
        f'<path fill="#000000" d="{modules_path(matrix)}"/></svg>'
    )
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


# ---------------- 贴纸 PNG ----------------

def write_sticker_png(matrix, args, probe: ImageFont.FreeTypeFont, path: Path) -> None:
    dpi = args.dpi
    scale = dpi / 25.4  # mm -> px

    def mm(v: float) -> int:
        return round(v * scale)

    lay = build_layout(args, probe)
    img = Image.new("RGB", (mm(args.sticker_w), mm(args.sticker_h)), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    def draw_text(x_mm: float, y_mm: float, text: str, pt: float, anchor: str) -> None:
        px = max(8, round(pt * MM_PER_PT * scale))
        f = load_font(px)
        stroke = max(1, round(px * 0.028))  # 描边模拟小标宋粗字重
        draw.text((mm(x_mm), mm(y_mm)), text, font=f, fill=(0, 0, 0),
                  anchor=anchor, stroke_width=stroke, stroke_fill=(0, 0, 0))

    draw_text(args.sticker_w / 2, lay["title_cy"], args.title, lay["title_pt"], "mm")
    y = lay["fields_y"]
    for line in lay["lines"]:
        draw_text(lay["margin"], y, line, lay["field_pt"], "la")
        y += lay["line_h"]

    # 二维码：浮点模块边界，物理尺寸精确 qr_size
    qr_x, qr_y, qr_size = lay["qr"]
    draw_qr_exact(draw, matrix, mm(qr_x), mm(qr_y), mm(qr_size))

    img.save(path, "PNG", dpi=(dpi, dpi))


# ---------------- 主流程 ----------------

def main() -> None:
    ap = argparse.ArgumentParser(description="电子标识贴纸与二维码生成器（附件3规范）")
    ap.add_argument("--url", default="https://amusement.xxx794665.party/motorcycle/",
                    help="二维码内容（设备信息页地址）")
    ap.add_argument("--title", default="游戏游艺设备电子标识", help="贴纸标题")
    ap.add_argument("--category", default="游艺娱乐设备", help="设备类别")
    ap.add_argument("--name", default="极速狂飙2豪华版", help="设备名称")
    ap.add_argument("--approval", default="粤游艺审〔2023〕803号", help="批准文号")
    ap.add_argument("--phone", default="12318", help="监督电话")
    ap.add_argument("--out", default="输出", help="输出目录")
    ap.add_argument("--dpi", type=int, default=600, help="贴纸/二维码 PNG 分辨率")
    ap.add_argument("--qr-size", type=float, default=24.0, help="二维码尺寸 mm（规范 24，含静区）")
    ap.add_argument("--sticker-w", type=float, default=80.0, help="贴纸宽 mm（规范 80）")
    ap.add_argument("--sticker-h", type=float, default=40.0, help="贴纸高 mm（规范 40）")
    ap.add_argument("--title-pt", type=float, default=24.0, help="标题字号 pt（规范 24）")
    ap.add_argument("--field-pt", type=float, default=16.0, help="字段字号 pt（规范 16；过长自动全组降 12）")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    matrix = qr_matrix(args.url)
    n = len(matrix)
    probe = load_font(200)

    write_qr_svg(matrix, out / "qr.svg", args.qr_size)
    write_qr_png(matrix, out / "qr.png", args.qr_size, args.dpi)
    write_sticker_svg(matrix, args, probe, out / "sticker.svg")
    write_sticker_png(matrix, args, probe, out / "sticker.png")

    lay = build_layout(args, probe)
    print(f"二维码内容: {args.url}")
    print(f"二维码: {n}x{n} 模块(含4模块静区), H级纠错, {args.qr_size:g}mm -> {out/'qr.svg'} / {out/'qr.png'}")
    print(f"贴纸: {args.sticker_w:g}x{args.sticker_h:g}mm @{args.dpi}DPI -> {out/'sticker.svg'} / {out/'sticker.png'}")
    print(f"标题 {lay['title_pt']:.1f}pt；字段统一 {lay['field_pt']}pt，{len(lay['lines'])} 行：")
    for line in lay["lines"]:
        print(f"  | {line}")


if __name__ == "__main__":
    main()
