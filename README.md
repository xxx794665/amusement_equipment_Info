# 游艺设备信息展示站（amusement_equipment_Info）

游乐场设备的**扫码信息页**：顾客扫贴在设备上的电子标识二维码，打开该设备的官方审批信息展示页。本仓库托管静态站点（GitHub Pages + Cloudflare 自定义域名）与**电子标识贴纸/二维码生成器**。

- 线上地址：<https://amusement.xxx794665.party/>（站点首页）/ <https://amusement.xxx794665.party/motorcycle/>（摩托车设备页）
- 数据口径：与"广东省文化和旅游厅"官方扫描页逐字一致（来源见维护手册第三节）
- 图片口径：官方登记图是旧版座舱式设备，站内图片按运营方提供的新版（摩托跨骑式）素材替换

## 目录结构

```
├── docs/                      # 站点根（GitHub Pages 发布目录，main 分支 /docs）
│   ├── CNAME                  # 自定义域名 amusement.xxx794665.party
│   ├── index.html             # 站点首页（设备索引）
│   └── motorcycle/            # 摩托车设备页（官方扫描页 1:1 复刻）
│       ├── index.html
│       └── images/            # 8 张站点用图（由脚本从素材转换）
├── scripts/
│   ├── build_images.py        # 素材图 → 站点 JPEG 转换（含栏目映射表）
│   └── make_sticker.py        # 电子标识贴纸 + 二维码生成器（附件3规范）
├── 素材/                       # 【不入库】运营方原始素材（图片全/铭牌照片）
├── 输出/                       # 【不入库】生成物（二维码/贴纸/对比图）
├── W020201125394256024235.docx # 附件3：电子标识组成规则及打印标准（规范依据）
├── README.md
└── 维护手册.md                 # 详细文档：数据来源/部署/新增设备/决策记录
```

## 常用命令

```bash
# 本地预览站点（http://127.0.0.1:8778/）
python -m http.server 8778 --directory docs

# 从素材重建站点图片（素材有更新时）
python scripts/build_images.py

# 生成二维码与电子标识贴纸（默认参数=摩托车设备，输出到 输出/）
python scripts/make_sticker.py

# 为其他设备生成贴纸
python scripts/make_sticker.py --url https://amusement.xxx794665.party/<设备>/ \
  --name "设备名称" --approval "粤游艺审〔20xx〕xxx号" --category 游艺娱乐设备
```

## 新增设备

见[维护手册.md](维护手册.md)第七节（复制页面/图片脚本、首页加卡片、出贴纸五步流程）。
