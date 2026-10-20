"""素材图 -> 站点用图转换脚本。

将 素材/图片全/摩托车/ 中选定的 8 张图转换为 docs/motorcycle/images/ 下的 JPEG
（最长边 1280px、质量 88、白底合成），供设备信息展示页使用。

MAPPING 记录了"官方页图片栏位 -> 新版设备素材图"的替换关系：
官方登记的极速狂飙2豪华版为旧版（座舱式），此处按用户要求全部替换为
素材目录中的新版（摩托跨骑式）设备图。

用法：python scripts/build_images.py
新增设备：复制本脚本，改 SRC/DST/MAPPING。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "素材" / "图片全" / "摩托车"
DST = ROOT / "docs" / "motorcycle" / "images"

# 输出文件名 -> (素材源文件, 官方页图片栏位)
MAPPING = {
    "analysis.jpg": ("粉色亚克力小车加屏幕.png", "外观说明图"),
    "front.jpg": ("摩托1.png", "正视图"),
    "left.jpg": ("摩托2.png", "左视图"),
    "right.jpg": ("摩托3.png", "右视图"),
    "panel.jpg": ("摩托车头.png", "机台主控面板"),
    "coin.jpg": ("双屏4.png", "投币口彩票出口"),
    "control.jpg": ("去按钮.png", "玩家操控区域"),
    "demo.jpg": ("摩托4.png", "玩家操作演示"),
}

MAX_SIDE = 1280
QUALITY = 88


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for out_name, (src_name, slot) in MAPPING.items():
        src = SRC / src_name
        if not src.exists():
            raise SystemExit(f"缺少素材文件: {src}")
        img = Image.open(src)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > MAX_SIDE:
            scale = MAX_SIDE / max(w, h)
            img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        out = DST / out_name
        img.save(out, "JPEG", quality=QUALITY, optimize=True)
        print(
            f"{slot}: {src_name} -> {out.relative_to(ROOT).as_posix()} "
            f"({img.size[0]}x{img.size[1]}, {out.stat().st_size // 1024}KB)"
        )


if __name__ == "__main__":
    main()
