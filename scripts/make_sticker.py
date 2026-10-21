"""游戏游艺设备电子标识贴纸 & 二维码生成器。

依据《游戏游艺设备电子标识组成规则及打印标准》（附件3，
仓库根 W020201125394256024235.docx）：
  - 字体：方正小标宋（简体）；本机未安装时回退宋体（SimSun）并加轻描边近似
  - 字号：标题「游戏游艺设备电子标识」24pt；字段（设备类别/设备名称/批准文号/
    监督电话）16pt；设备名称过长时可回行处理、字号缩小（规范下限 12pt）
  - 设备名称：进口设备名称后加「（进口）」
  - 批准文号：省份简称 + 游戏审/游艺审 + 〔年份〕 + 批次号，例如 冀游艺审〔2020〕1号
  - 二维码：24mm×24mm，H 级纠错（含 4 模块静区，贴设备上防磨损）
  - 纸张：80mm×40mm 亚银PET标签纸（耗材 90mm×300mm 树脂碳带）
  - 版面按附件3「电子标识示例」：圆角细边框、标题居中、左侧四字段
    （标签列/值列对齐、过长值悬挂缩进回行）、右侧 24mm 二维码

物理排版说明（为什么实际字号会小于规范值）：
  80mm 宽内并排放 24mm 二维码 + 标题 + 四字段，按规范字号无法物理容纳——
  10 字 24pt 标题宽约 84.7mm 已超过 80mm；"批准文号：…" 16pt 一行也远超二维码
  左侧可用列宽，必然换行。附件3 的示例图本身也是按比例示意的缩略版（其文字在
  80mm 标签上的实际观感约为字段 9pt / 标题 13.5pt）。
  因此脚本以「示例观感 + 可打印」为准：
    - 硬约束：**批准文号必须整行显示**、**设备名称最多 2 行**（逐档取最大字段字号
      直到两条都满足）；
    - 字段字号在 7–16pt 间自适应：本批线上普通设备为 9pt，最长名称设备 #3 为 7.5pt
      （7.5pt 才能把 23 字名称压到 2 行，同时批准文号仍单行）；6–6.5pt 为极端兜底并标记
      manifest.layout_fallback；
    - 标题保持官方 24:16 = 1.5 比例（本批普通设备 13.5pt、#3 为 11.25pt，均不超过 24pt）；
    - 四字段行距在内容区内适当拉大（字高+0.5mm 起，上限 6.2mm），整版更舒展。
  实际字号/行距随生成结果打印，并写入 manifest.json，便于按需复核。

输出：
  单设备模式（--url/--name/--approval …，默认即设备 #1）：
    <out>/sticker.png  整张贴纸（默认 600DPI，精确 80×40mm）
    <out>/sticker.svg  整张贴纸（矢量文本 + 矢量二维码）
    <out>/qr.png       独立二维码（24×24mm，DPI 元数据）
    <out>/qr.svg       独立二维码（纯矢量）
  批量模式（--devices-json devices.json）：
    <out>/<id>_<设备名>/sticker.png|svg + qr.png|svg
    <out>/manifest.json  生成清单（设备、批准文号、字号、行距、回行数、二维码内容、
                          approval_single_line / layout_fallback 审计标记）
    <out>/预览_<N>台拼版.png  本批贴纸 3 列拼版预览（目视复核用）

用法：
  python scripts/make_sticker.py                      # 单设备（默认设备 #1）
  python scripts/make_sticker.py --url https://.../d/9 --name "三国名将" --approval "湘游艺审〔2024〕16号"
  python scripts/make_sticker.py --devices-json 输出/电子标识/devices.json --out 输出/电子标识
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import math
import os
import re
import time
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

# ---------------- 规范常量（附件3） ----------------

MM_PER_PT = 25.4 / 72.0

PAGE_W = 80.0          # 标签纸宽 mm
PAGE_H = 40.0          # 标签纸高 mm
QR_SIZE = 24.0         # 二维码边长 mm（规范 24mm×24mm）
QR_BORDER_MODULES = 4  # 二维码静区模块数

TITLE_PT_MAX = 24.0
FIELD_PT_MAX = 16.0
FIELD_PT_MIN = 7.0
FIELD_PT_STEP = 0.5
TITLE_FIELD_RATIO = TITLE_PT_MAX / FIELD_PT_MAX  # 1.5，用于等比收缩

# 版面留白与间距（依据官方示例比例，适配 80×40mm 实体标签）
MARGIN_L = 2.5
MARGIN_R = 2.5
MARGIN_TOP = 3.4
MARGIN_BOTTOM = 3.0
BORDER_INSET = 0.45
BORDER_RADIUS = 1.6
BORDER_STROKE = 0.2
TITLE_GAP = 1.2
QR_GAP = 1.0
LABEL_GAP = 0.9
# 字段行距：最小字高+0.5mm；空间富余时适当拉大（上限 6.2mm），提升整版观感
FIELD_PITCH_MIN_GAP = 0.5
FIELD_PITCH_MAX = 6.2
TITLE_LINE_RATIO = 1.18
# 设备名称最多占 2 行（长名称设备按此下探字号；#3 名称 23 字 → 7.5pt 可压到 2 行）
NAME_MAX_LINES = 2
# 单个不可拆原子允许的微量溢出（mm）：小于二维码间距，保证不会压到二维码；
# 避免「〔2023〕413号」这类差 0.3mm 的原子被硬拆成「〔2023〕41」/「3号」。
SPLIT_TOLERANCE = 0.8

DEFAULT_TITLE = "游戏游艺设备电子标识"
DEFAULT_CATEGORY = "游艺娱乐设备"
DEFAULT_PHONE = "12318"
DEFAULT_APPROVAL = "粤游艺审〔2023〕803号"
DEFAULT_NAME = "极速狂飙2豪华版"
DEFAULT_URL_TEMPLATE = "https://amusement.xxx794665.party/d/{id}"

# 字段：label=标签文字（示例中「设备类别」无冒号，其余带全角冒号）、key=数据键
FIELDS = [
    ("设备类别", "category"),
    ("设备名称：", "name"),
    ("批准文号：", "approval"),
    ("监督电话：", "phone"),
]

# SVG 字体栈：装有方正小标宋的机器精确渲染，否则回退宋体
FONT_STACK = "'FZXiaoBiaoSong-B05S','方正小标宋简体','FZXiaoBiaoSong',SimSun,'宋体',serif"

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\FZXiaoBiaoSong-B05S.TTF",
    r"C:\Windows\Fonts\FZXiaoBiaoSong_GBK.TTF",
    r"C:\Windows\Fonts\FZXBSJW.TTF",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\FZXiaoBiaoSong-B05S.TTF"),
    r"C:\Windows\Fonts\simsun.ttc",
]

APPROVAL_RE = re.compile(r"^[\u4e00-\u9fa5]{1,4}(游戏审|游艺审)〔\d{4}〕\d+号$")

# 中文排版禁则：这些字符不能出现在行首
NO_LINE_START = "〕〉》」』）】，。、；：？！…—%\"”’"
OPEN_BRACKETS = "〔（【《「『("
CLOSE_BRACKETS = "〕）】》」』)"


# ---------------- 二维码 ----------------

def qr_matrix(data: str, border: int = QR_BORDER_MODULES) -> list[list[bool]]:
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


def write_qr_svg(matrix: list[list[bool]], path: Path, size_mm: float = QR_SIZE) -> None:
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
    """浮点模块边界绘制：n 个模块铺满 total_px，保证物理尺寸精确。"""
    n = len(matrix)
    for r, row in enumerate(matrix):
        y0 = int(round(y_px + r * total_px / n))
        y1 = int(round(y_px + (r + 1) * total_px / n)) - 1
        if y1 < y0:
            continue
        for c, dark in enumerate(row):
            if dark:
                x0 = int(round(x_px + c * total_px / n))
                x1 = int(round(x_px + (c + 1) * total_px / n)) - 1
                if x1 >= x0:
                    draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))


def save_png(img: Image.Image, path: Path, dpi: int, attempts: int = 3) -> None:
    """保存 PNG（Windows 上偶发杀毒扫描占用导致 OSError，短重试以免整批失败）。"""
    last = None
    for i in range(attempts):
        try:
            img.save(path, "PNG", dpi=(dpi, dpi))
            return
        except OSError as exc:  # 文件被占用/临时锁定时重试
            last = exc
            time.sleep(0.2 * (i + 1))
    raise OSError(f"写入 {path} 失败（已重试 {attempts} 次）：{last}") from last


def write_qr_png(matrix: list[list[bool]], path: Path, dpi: int) -> None:
    total = round(QR_SIZE / 25.4 * dpi)
    img = Image.new("RGB", (total, total), (255, 255, 255))
    draw_qr_exact(ImageDraw.Draw(img), matrix, 0, 0, total)
    save_png(img, path, dpi)


# ---------------- 字体与文本测量 ----------------

class Fonts:
    def __init__(self, override: str | None = None):
        patterns = [
            p for pat in (
                r"C:\Windows\Fonts\*小标宋*.ttf",
                os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts\*小标宋*.ttf"),
            )
            for p in glob.glob(pat)
        ]
        self.candidates = ([override] if override else []) + FONT_CANDIDATES + patterns
        self.cache: dict[int, ImageFont.FreeTypeFont] = {}
        self.probe = self._load(200)

    def _load(self, px: int) -> ImageFont.FreeTypeFont:
        if px in self.cache:
            return self.cache[px]
        for cand in self.candidates:
            if not cand:
                continue
            try:
                font = ImageFont.truetype(cand, px)
                self.cache[px] = font
                self.path = cand
                return font
            except OSError:
                continue
        raise SystemExit("未找到可用中文字体（simsun.ttc），无法渲染贴纸")


def text_width_mm(text: str, pt: float, probe: ImageFont.FreeTypeFont) -> float:
    """用探针字号测量文本宽度，换算为指定 pt 对应的毫米宽。"""
    if not text:
        return 0.0
    return probe.getlength(text) * (pt * MM_PER_PT) / probe.size


# ---------------- 回行排版 ----------------

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


def _split_overlong(atom: str, pt: float, max_mm: float,
                    probe: ImageFont.FreeTypeFont) -> list[str]:
    """把超宽原子拆成可回行的碎片：优先在顿号/逗号/分号后断，仍超宽再按字符断。

    避免「（红色、黄色、橙色、绿色）」这类整组超宽括号内容直接压到二维码上。
    """
    if text_width_mm(atom, pt, probe) <= max_mm + SPLIT_TOLERANCE:
        return [atom]
    parts: list[str] = []
    cur = ""
    for ch in atom:
        cur += ch
        if ch in "、，；" and cur:
            parts.append(cur)
            cur = ""
    if cur:
        parts.append(cur)
    out: list[str] = []
    for part in parts:
        if text_width_mm(part, pt, probe) <= max_mm + SPLIT_TOLERANCE:
            out.append(part)
        else:
            out.extend(list(part))
    return out


def wrap_text(text: str, pt: float, max_mm: float, probe: ImageFont.FreeTypeFont) -> list[str]:
    """回行排版：原子化后动态规划取最均衡断行（每行宽度尽量接近），
    括号组/数字串优先不拆分（整组超宽时才在顿号/字符处拆开），
    闭合标点不起行、开括号不落行尾，末行避免单字孤行。"""
    text = text.strip()
    if not text:
        return [""]
    if text_width_mm(text, pt, probe) <= max_mm + SPLIT_TOLERANCE:
        return [text]
    atoms = _glue(tokenize(text))
    atoms = [piece for atom in atoms for piece in _split_overlong(atom, pt, max_mm, probe)]
    widths = [text_width_mm(atom, pt, probe) for atom in atoms]
    n = len(atoms)
    inf = float("inf")
    best = [inf] * (n + 1)
    prev = [-1] * (n + 1)
    best[0] = 0.0
    for j in range(1, n + 1):
        w = 0.0
        for i in range(j - 1, -1, -1):
            w += widths[i]
            if w > max_mm + 1e-6 and i < j - 1:
                break
            if i > 0:
                if atoms[i][0] in NO_LINE_START:      # 标点不能起行
                    continue
                if atoms[i - 1][-1] in OPEN_BRACKETS:  # 开括号不能落行尾
                    continue
            cost = best[i] + (max_mm - min(w, max_mm)) ** 2
            if cost < best[j]:
                best[j] = cost
                prev[j] = i
    if prev[n] < 0:  # 极端兜底：贪心
        lines, cur = [], ""
        for atom in atoms:
            if cur and text_width_mm(cur + atom, pt, probe) > max_mm:
                lines.append(cur)
                cur = atom
            else:
                cur += atom
        if cur:
            lines.append(cur)
        return [line for line in lines if line]
    lines: list[str] = []
    j = n
    while j > 0:
        i = prev[j]
        lines.append("".join(atoms[i:j]))
        j = i
    lines.reverse()
    # 孤字处理：末行只有 1 字符且上一行超过 2 字符时，匀一个下来
    if len(lines) >= 2 and len(lines[-1]) == 1 and len(lines[-2]) > 2:
        lines[-1] = lines[-2][-1] + lines[-1]
        lines[-2] = lines[-2][:-1]
    return [line for line in lines if line]


# ---------------- 版面计算 ----------------

def build_layout(dev: dict, probe: ImageFont.FreeTypeFont) -> dict:
    """计算 80×40mm 版面（单位 mm）：标题 / 四字段（标签列+值列）/ 24mm 二维码。

    字号策略：以附件3示例的观感为基准（80mm 标签上正文约 8.5–9pt、标题约 13pt），
    硬约束是「批准文号整行不换行」；在该约束下取最大可用字段字号。标题按官方
    24:16 = 1.5 比例随字段字号缩放（不超过 24pt）。行距在内容区高度内适当拉大，
    上限 FIELD_PITCH_MAX，让整版更舒展。
    """
    title_text = dev.get("title") or DEFAULT_TITLE
    qr_x = PAGE_W - MARGIN_R - QR_SIZE
    qr_left_limit = qr_x - QR_GAP
    content_bottom = PAGE_H - MARGIN_BOTTOM
    title_max_w = PAGE_W - 2 * 2.2  # 标题左右至少留 2.2mm

    def title_metrics(field_pt: float) -> tuple[float, float, float, float]:
        """返回 (title_pt, title_em, title_box_h, content_top)。"""
        title_pt = min(TITLE_PT_MAX, field_pt * TITLE_FIELD_RATIO)
        tw = text_width_mm(title_text, title_pt, probe)
        if tw > title_max_w:
            title_pt *= title_max_w / tw
        title_em = title_pt * MM_PER_PT
        title_box_h = title_em * TITLE_LINE_RATIO
        return title_pt, title_em, title_box_h, MARGIN_TOP + title_box_h + TITLE_GAP

    def attempt(field_pt: float):
        title_pt, title_em, title_box_h, content_top = title_metrics(field_pt)
        content_h = content_bottom - content_top
        label_col = max(text_width_mm(label, field_pt, probe) for label, _ in FIELDS) + LABEL_GAP
        value_x = MARGIN_L + label_col
        value_w = qr_left_limit - value_x
        if value_w < 12.0 or content_h < 12.0:
            return None
        wrapped = [
            (label, wrap_text(dev.get(key, ""), field_pt, value_w, probe))
            for label, key in FIELDS
        ]
        # 硬约束：批准文号必须单行显示；设备名称最多 2 行
        approval_lines = next(lines for label, lines in wrapped if label.startswith("批准文号"))
        if len(approval_lines) != 1:
            return None
        name_lines = next(lines for label, lines in wrapped if label.startswith("设备名称"))
        if len(name_lines) > NAME_MAX_LINES:
            return None
        n_lines = sum(len(lines) for _, lines in wrapped)
        min_pitch = field_pt * MM_PER_PT + FIELD_PITCH_MIN_GAP
        if n_lines * min_pitch > content_h + 1e-6:
            return None
        pitch = max(min_pitch, min(FIELD_PITCH_MAX, content_h / n_lines))
        return {
            "field_pt": field_pt, "title_pt": title_pt,
            "title_box_h": title_box_h, "content_top": content_top,
            "content_h": content_h, "label_col": label_col, "value_x": value_x,
            "value_w": value_w, "line_h": pitch, "fields": wrapped,
            "n_lines": n_lines, "total_h": n_lines * pitch,
        }

    chosen = None
    field_pt = FIELD_PT_MAX
    while field_pt >= FIELD_PT_MIN - 1e-9:
        chosen = attempt(field_pt)
        if chosen:
            break
        field_pt -= FIELD_PT_STEP

    # 兜底：继续降到 6pt 仍强制「批准文号单行 + 名称≤2 行」；绝不静默输出拆行/溢出排版
    fallback = False
    if chosen is None:
        field_pt = 6.5
        while field_pt >= 6.0 - 1e-9:
            chosen = attempt(field_pt)
            if chosen:
                fallback = True
                break
            field_pt -= FIELD_PT_STEP
    if chosen is None:
        raise SystemExit(
            f"排版失败：设备 #{dev.get('id')}「{dev['name']}」无法在 80×40mm 内同时满足"
            "「批准文号单行」与「不溢出/不重叠」；请缩短设备名称或批准文号，或人工排版"
        )

    chosen["layout_fallback"] = fallback
    chosen["approval_single_line"] = True

    chosen["fields_top"] = chosen["content_top"] + (chosen["content_h"] - chosen["total_h"]) / 2
    chosen["title_center_y"] = MARGIN_TOP + chosen["title_box_h"] / 2
    chosen["qr"] = (
        qr_x,
        chosen["content_top"] + (chosen["content_h"] - QR_SIZE) / 2,
        QR_SIZE,
    )
    chosen["label_x"] = MARGIN_L
    return chosen


# ---------------- 贴纸输出 ----------------

def write_sticker_svg(matrix: list[list[bool]], dev: dict, lay: dict, path: Path) -> None:
    n = len(matrix)
    qr_x, qr_y, qr_size = lay["qr"]
    t_fs = lay["title_pt"] * MM_PER_PT
    f_fs = lay["field_pt"] * MM_PER_PT
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{PAGE_W:g}mm" height="{PAGE_H:g}mm" '
        f'viewBox="0 0 {PAGE_W:g} {PAGE_H:g}">',
        f'<rect width="{PAGE_W:g}" height="{PAGE_H:g}" fill="#ffffff"/>',
        f'<rect x="{BORDER_INSET:g}" y="{BORDER_INSET:g}" '
        f'width="{PAGE_W - 2 * BORDER_INSET:g}" height="{PAGE_H - 2 * BORDER_INSET:g}" '
        f'rx="{BORDER_RADIUS:g}" fill="none" stroke="#000000" stroke-width="{BORDER_STROKE:g}"/>',
    ]
    parts.append(
        f'<text x="{PAGE_W / 2:g}" y="{lay["title_center_y"] + t_fs * 0.36:g}" '
        f'font-size="{t_fs:g}" font-family="{FONT_STACK}" font-weight="bold" '
        f'text-anchor="middle" fill="#000000">{html.escape(dev["title"])}</text>'
    )
    y = lay["fields_top"]
    for label, lines in lay["fields"]:
        for i, line in enumerate(lines):
            if i == 0:
                parts.append(
                    f'<text x="{lay["label_x"]:g}" y="{y + f_fs * 0.36:g}" '
                    f'font-size="{f_fs:g}" font-family="{FONT_STACK}" font-weight="bold" '
                    f'fill="#000000">{html.escape(label)}</text>'
                )
            if line:
                parts.append(
                    f'<text x="{lay["value_x"]:g}" y="{y + f_fs * 0.36:g}" '
                    f'font-size="{f_fs:g}" font-family="{FONT_STACK}" font-weight="bold" '
                    f'fill="#000000">{html.escape(line)}</text>'
                )
            y += lay["line_h"]
    parts.append(
        f'<svg x="{qr_x:g}" y="{qr_y:g}" width="{qr_size:g}" height="{qr_size:g}" '
        f'viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
        f'<rect width="{n}" height="{n}" fill="#ffffff"/>'
        f'<path fill="#000000" d="{modules_path(matrix)}"/></svg>'
    )
    parts.append("</svg>")
    path.write_text("\n".join(parts), encoding="utf-8")


def write_sticker_png(matrix: list[list[bool]], dev: dict, lay: dict, path: Path,
                      dpi: int, fonts: Fonts) -> None:
    scale = dpi / 25.4  # mm -> px

    def mm(v: float) -> int:
        return int(round(v * scale))

    img = Image.new("RGB", (mm(PAGE_W), mm(PAGE_H)), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    def draw_text(x_mm: float, center_y_mm: float, text: str, pt: float, anchor: str,
                  stroke_ratio: float = 0.012) -> None:
        if not text:
            return
        px = max(8, int(round(pt * MM_PER_PT * scale)))
        font = fonts._load(px)
        stroke = max(1, int(round(px * stroke_ratio)))
        draw.text((mm(x_mm), mm(center_y_mm)), text, font=font, fill=(0, 0, 0),
                  anchor=anchor, stroke_width=stroke, stroke_fill=(0, 0, 0))

    # 圆角边框（官方示例：细边框、圆角）
    draw.rounded_rectangle(
        [mm(BORDER_INSET), mm(BORDER_INSET), mm(PAGE_W - BORDER_INSET), mm(PAGE_H - BORDER_INSET)],
        radius=mm(BORDER_RADIUS), outline=(0, 0, 0),
        width=max(1, int(round(BORDER_STROKE * scale))),
    )

    draw_text(PAGE_W / 2, lay["title_center_y"], dev["title"], lay["title_pt"],
              "mm", stroke_ratio=0.014)

    y = lay["fields_top"]
    for label, lines in lay["fields"]:
        for i, line in enumerate(lines):
            if i == 0:
                draw_text(lay["label_x"], y + lay["line_h"] / 2, label, lay["field_pt"], "lm")
            draw_text(lay["value_x"], y + lay["line_h"] / 2, line, lay["field_pt"], "lm")
            y += lay["line_h"]

    qr_x, qr_y, _ = lay["qr"]
    draw_qr_exact(draw, matrix, mm(qr_x), mm(qr_y), mm(QR_SIZE))
    save_png(img, path, dpi)


def render_device(dev: dict, out_dir: Path, args, fonts: Fonts) -> dict:
    """生成一台设备的贴纸与二维码，返回清单信息。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    matrix = qr_matrix(dev["url"])
    lay = build_layout(dev, fonts.probe)

    write_qr_svg(matrix, out_dir / "qr.svg")
    write_qr_png(matrix, out_dir / "qr.png", args.dpi)
    write_sticker_svg(matrix, dev, lay, out_dir / "sticker.svg")
    write_sticker_png(matrix, dev, lay, out_dir / "sticker.png", args.dpi, fonts)

    return {
        "id": dev.get("id"),
        "name": dev["name"],
        "category": dev["category"],
        "approval": dev["approval"],
        "url": dev["url"],
        "title": dev["title"],
        "field_pt": lay["field_pt"],
        "title_pt": round(lay["title_pt"], 2),
        "field_lines": sum(len(lines) for _, lines in lay["fields"]),
        "name_lines": next(len(lines) for label, lines in lay["fields"] if label.startswith("设备名称")),
        "line_pitch_mm": round(lay["line_h"], 2),
        "qr_modules": len(matrix),
        "dir": out_dir.name,
        "files": ["sticker.png", "sticker.svg", "qr.png", "qr.svg"],
        "size_mm": [PAGE_W, PAGE_H],
        "qr_size_mm": QR_SIZE,
        "dpi": args.dpi,
        "approval_single_line": lay["approval_single_line"],
        "layout_fallback": lay["layout_fallback"],
        "font": Path(getattr(fonts, "path", "")).name if getattr(fonts, "path", "") else "",
    }


# ---------------- 输入处理 ----------------

def normalize_device(raw: dict, args, default_url: str | None = None) -> dict:
    name = str(raw.get("name") or raw.get("device_name") or "").strip()
    category = str(raw.get("category") or raw.get("device_type") or DEFAULT_CATEGORY).strip()
    approval = "".join(str(raw.get("approval") or raw.get("approval_number") or "").split())
    phone = "".join(str(raw.get("phone") or args.phone).split())
    title = str(raw.get("title") or args.title).strip()
    url = raw.get("url") or default_url
    if not name:
        raise SystemExit(f"设备 #{raw.get('id')} 缺少设备名称")
    if not url:
        raise SystemExit(f"设备 #{raw.get('id')} 缺少二维码地址")
    if not APPROVAL_RE.match(approval):
        print(f"  ! 警告：设备 #{raw.get('id')} 批准文号格式待核对：{approval}")
    dev = {
        "id": raw.get("id"),
        "name": name,
        "category": category,
        "approval": approval,
        "phone": phone,
        "title": title,
    }
    # 二维码内容（批量模式由 --url-template 生成）
    dev["url"] = url
    return dev


def safe_dirname(dev: dict) -> str:
    name = re.sub(r'[\\/:*?"<>|\r\n\t ]+', "_", dev["name"])[:40].strip("_")
    return f"{dev.get('id', 'device')}_{name}"


def print_summary(row: dict) -> None:
    note = "（兜底字号，建议复核）" if row.get("layout_fallback") else ""
    print(
        f"  #{row['id']:<3} {row['name']} | 字段 {row['field_pt']}pt / 标题 {row['title_pt']}pt / "
        f"{row['field_lines']} 行 | {row['approval']}{note}"
    )


def write_preview_sheet(entries: list[dict], out_root: Path,
                        cell_w: int = 620, cell_h: int = 310, gap: int = 16) -> Path | None:
    """把本批贴纸拼成 3 列预览图（便于目视复核，随批量输出一并生成）。"""
    if not entries:
        return None
    cols = min(3, len(entries))
    n_rows = math.ceil(len(entries) / cols)
    sheet = Image.new(
        "RGB",
        (cols * cell_w + (cols + 1) * gap, n_rows * cell_h + (n_rows + 1) * gap),
        (225, 225, 230),
    )
    for i, row in enumerate(entries):
        img = Image.open(out_root / row["dir"] / "sticker.png").convert("RGB")
        img = img.resize((cell_w, cell_h), Image.LANCZOS)
        r, c = divmod(i, cols)
        sheet.paste(img, (gap + c * (cell_w + gap), gap + r * (cell_h + gap)))
    path = out_root / f"预览_{len(entries)}台拼版.png"
    sheet.save(path)
    return path


# ---------------- 主流程 ----------------

def main() -> None:
    ap = argparse.ArgumentParser(description="电子标识贴纸与二维码生成器（附件3规范）")
    ap.add_argument("--url", help="单设备模式：二维码内容（设备信息页地址）")
    ap.add_argument("--name", default=DEFAULT_NAME, help="单设备模式：设备名称")
    ap.add_argument("--category", default=DEFAULT_CATEGORY, help="设备类别")
    ap.add_argument("--approval", default=DEFAULT_APPROVAL, help="批准文号")
    ap.add_argument("--phone", default=DEFAULT_PHONE, help="监督电话")
    ap.add_argument("--title", default=DEFAULT_TITLE, help="贴纸标题")
    ap.add_argument("--out", default="输出", help="输出目录")
    ap.add_argument("--dpi", type=int, default=600, help="贴纸 PNG 分辨率")
    ap.add_argument("--devices-json", help="批量模式：设备 JSON 文件（字段 id/name/category/approval）")
    ap.add_argument("--url-template", default=DEFAULT_URL_TEMPLATE,
                    help="批量模式二维码地址模板，{id} 替换为设备 id")
    ap.add_argument("--font", help="指定字体文件（默认查找方正小标宋，找不到回落宋体）")
    args = ap.parse_args()

    fonts = Fonts(args.font)
    out_root = Path(args.out)
    try:
        out_root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise SystemExit(f"无法创建输出目录 {out_root}：{exc}") from exc

    if args.devices_json:
        json_path = Path(args.devices_json)
        try:
            devices_raw = json.loads(json_path.read_text(encoding="utf-8"))
        except OSError as exc:
            raise SystemExit(f"无法读取 --devices-json 文件 {json_path}：{exc}") from exc
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--devices-json 不是合法 JSON：{exc}") from exc
        if not isinstance(devices_raw, list) or not devices_raw:
            raise SystemExit("--devices-json 需为非空的设备对象数组")
        manifest = []
        print(f"批量生成 {len(devices_raw)} 台设备电子标识 -> {out_root}")
        # 先全量预排版：任一设备无法满足硬约束就直接报错，避免留下半批产物
        devices = []
        for raw in devices_raw:
            if not isinstance(raw, dict):
                raise SystemExit("--devices-json 的每个条目都必须是设备对象")
            url = raw.get("url") or args.url_template.format(id=raw.get("id"))
            dev = normalize_device(raw, args, default_url=url)
            build_layout(dev, fonts.probe)  # 预检：失败抛 SystemExit
            devices.append(dev)
        for dev in devices:
            target = out_root / safe_dirname(dev)
            row = render_device(dev, target, args, fonts)
            manifest.append(row)
            print_summary(row)
        (out_root / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        preview = write_preview_sheet(manifest, out_root)
        print(f"\n清单: {out_root / 'manifest.json'}")
        if preview:
            print(f"拼版预览: {preview}")
        print(f"每台设备目录内含 sticker.png/svg + qr.png/svg（贴纸 {PAGE_W:g}×{PAGE_H:g}mm @{args.dpi}DPI）")
        if any(row["layout_fallback"] for row in manifest):
            print("  ! 提示：部分设备使用了 6–6.5pt 兜底字号（manifest.layout_fallback=true），打印前请目视复核")
        return

    # 单设备模式（保持原有用法）
    url = args.url or args.url_template.format(id=1)
    dev = normalize_device(
        {
            "id": 1, "name": args.name, "category": args.category,
            "approval": args.approval, "phone": args.phone, "title": args.title,
        },
        args, default_url=url,
    )
    row = render_device(dev, out_root, args, fonts)
    print_summary(row)
    print(f"\n输出目录: {out_root}")
    print(f"  贴纸: sticker.png / sticker.svg（{PAGE_W:g}×{PAGE_H:g}mm @{args.dpi}DPI）")
    print(f"  二维码: qr.png / qr.svg（{QR_SIZE:g}mm，H 级纠错，含 {QR_BORDER_MODULES} 模块静区）")
    print(f"  实际字号：字段 {row['field_pt']}pt，标题 {row['title_pt']}pt（规范比例 24:16=1.5:1）")


if __name__ == "__main__":
    main()
