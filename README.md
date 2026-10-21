# 游艺设备信息展示站（amusement_equipment_Info）

游乐场设备的**扫码信息页**：顾客扫贴在设备上的二维码，打开该设备的官方审批信息展示页。本仓库包含：**CF Workers 动态站点**（展示页 + 管理端，数据在 D1、图片在 R2）与**电子标识贴纸/二维码本地生成器**。

- 线上地址：<https://amusement.xxx794665.party/>（设备列表）/ <https://amusement.xxx794665.party/d/1>（摩托车设备页）/ <https://amusement.xxx794665.party/admin>（管理端，口令登录）
- 数据口径：展示页逐字复刻"广东省文化和旅游厅"官方扫描页；基础信息可从官方接口预填采集，图片由运营方上传
- 架构：GitHub Pages 静态站已于 2026-10-21 下线（`docs/` 留作历史与灾备素材），现行架构见[维护手册.md](维护手册.md)第十一节与 `docs/adr/`
- 图片：双存储后端（管理端可选）——**阿里云 OSS 预签名直传（默认，北京桶，国内访问快）** 或 CF R2（站内 `/img/` 路径）；AK/SK 只存 Worker secrets

## 目录结构

```
├── worker/                    # 现行站点：CF Worker 源码（详见其内 wrangler.toml）
│   ├── src/index.js           # 入口路由：/ 列表 · /d/<id> 展示页 · /img/* R2 图片 · /admin 管理端 · /api/*
│   ├── schema.sql             # D1 建表 SQL
│   └── .dev.vars              # 【不入库】本地开发密钥
├── docs/                      # 【已下线的静态站】历史素材 + adr/ 架构决策记录
├── scripts/                   # 电子标识贴纸/二维码本地生成器（附件3规范）
├── 素材/                       # 【不入库】运营方原始素材
├── 输出/                       # 【不入库】生成物
├── CONTEXT.md                 # 领域词汇表
├── README.md
└── 维护手册.md                 # 详细文档：数据来源/动态化架构/部署/运营操作/决策记录
```

## 常用命令

```bash
# 本地开发（D1/R2 本地模拟，先执行一次建表）
cd worker
npx wrangler d1 execute amusement-db --local --file schema.sql
npx wrangler dev                       # http://127.0.0.1:8787

# 部署（详见维护手册 11.4）
npx esbuild src/index.js --bundle --format=esm --outfile=dist/index.js
npx wrangler deploy

# 电子标识贴纸/二维码本地生成（80×40mm 规范排版）
python scripts/make_sticker.py --url https://amusement.xxx794665.party/d/1 \
  --name "设备名称" --approval "粤游艺审〔20xx〕xxx号" --category 游艺娱乐设备
```

## 日常维护（运营方）

设备增改、传图、上下架、二维码下载全部在 `/admin` 管理端完成（见[维护手册.md](维护手册.md)11.5 操作五步）；贴纸打印用本地脚本。
