// 展示页 12 个文字字段（顺序与页面一致）与 8 个图片栏位。
// api = 官方接口外层 data 的字段名；api2 = data.newData 的兜底字段名
// （两个字段集合同名时值一致；联系人/电话在两层字段名不同，以先到者为准）。
export const FIELDS = [
  { key: "company", label: "企业名称", api: "company", api2: "company" },
  { key: "device_type", label: "设备类别", api: "deviceType", api2: "deviceType" },
  { key: "approval_number", label: "审核批准编号", api: "approvalNumber", api2: null },
  { key: "device_name", label: "设备名称", api: "deviceName", api2: "deviceName" },
  { key: "power", label: "产品功率", api: "power", api2: "power" },
  { key: "owner", label: "产权拥有人", api: "elementTitleOwner", api2: null },
  { key: "contact", label: "联系人", api: "legalRepresentative", api2: "contact" },
  { key: "phone", label: "电话", api: "legalMobile", api2: "contactMobile" },
  { key: "address", label: "地址", api: "detailedAddress", api2: "detailedAddress" },
  { key: "zipcode", label: "邮政编码", api: "zipCode", api2: "zipCode" },
  { key: "game_intro", label: "游戏内容简介", api: "gameIntroduction", api2: "gameIntroduction" },
  { key: "instructions", label: "操作说明", api: "operatingInstructions", api2: "operatingInstructions" },
];

// 8 个图片栏位：slot 用于 R2 键名（amusement/<id>/<slot>.<ext>）与上传接口校验
export const SLOTS = [
  { key: "img_appearance", slot: "appearance", title: "外观说明图" },
  { key: "img_front", slot: "front", title: "正视图" },
  { key: "img_left", slot: "left", title: "左视图" },
  { key: "img_right", slot: "right", title: "右视图" },
  { key: "img_panel", slot: "panel", title: "机台主控面板图片及说明" },
  { key: "img_coin", slot: "coin", title: "投币口彩票出口图片及说明" },
  { key: "img_control", slot: "control", title: "玩家操控区域图片及说明" },
  { key: "img_demo", slot: "demo", title: "玩家操作演示照片及说明" },
];

export const TEXT_KEYS = FIELDS.map((f) => f.key);
export const IMG_KEYS = SLOTS.map((s) => s.key);
export const SLOT_BY_KEY = Object.fromEntries(SLOTS.map((s) => [s.key, s]));

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// 展示页标题与 scanTop 批准单位的默认值（复刻官方页固定文案）。
// 可被 D1 settings 表覆盖（见 settings.js）；存量数据无设置行时即用此默认值。
export const DEFAULT_PAGE_TITLE = "广东省游戏游艺设备内容审核系统";
export const DEFAULT_PAGE_TOP = "广东省文化和旅游厅";

// settings 表的键：page_title=展示页 <title>、scan_top=顶部 scanTop 批准单位条
export const SETTING_KEYS = ["page_title", "scan_top"];
export const SETTING_MAX_LEN = 200;
