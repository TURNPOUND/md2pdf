/**
 * 配置与参数归一化
 * 所有尺寸单位：mm（纸张/页边距）；字号单位：pt
 */

export const PAPER_SIZES = {
  A3: { w: 297, h: 420 },
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  B5: { w: 176, h: 250 },
  B4: { w: 250, h: 353 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
};

/** 页边距预设（mm） */
export const MARGIN_PRESETS = {
  normal: { top: 20, right: 18, bottom: 20, left: 18 },
  narrow: { top: 12, right: 12, bottom: 15, left: 12 },
  wide: { top: 25, right: 25, bottom: 25, left: 25 },
  book: { top: 20, right: 18, bottom: 20, left: 25 },
};

export const THEMES = ['default', 'print'];

export const DEFAULTS = {
  /** 纸张：A4 | A5 | B5 | Letter ... */
  paper: 'A4',
  landscape: false,
  /** 页边距：预设名或 mm 数字或 {top,right,bottom,left} */
  margin: 'normal',
  /** 主题：default（彩印/电子） | print（黑白省墨） */
  theme: 'print',
  /** 正文字号 pt */
  fontSize: 10.5,
  lineHeight: 1.7,
  /** 首行缩进（em），0 = 不缩进，2 = 中文公文风格 */
  textIndent: 0,
  /** 正文对齐：left | justify */
  textAlign: 'left',
  /** 强调色 */
  accent: '#2b6cb0',
  /** 生成目录 */
  toc: false,
  /** 表格线：grid = 完整网格（含竖线） | rules = 只有横线 */
  tableLines: 'grid',
  /** 页脚页码 */
  pageNumbers: true,
  /** 页眉文字，空则用文档标题 */
  headerText: '',
  /** 页脚左侧文字 */
  footerText: '',
  /** 覆盖文档标题 */
  title: null,
  author: null,
  /** 允许数学公式 */
  katex: true,
  /** 允许 Mermaid 图 */
  mermaid: true,
  /** 代码高亮 */
  highlight: true,
  /** 每章强制分页（按一级标题） */
  pageBreakOnH1: false,
  /** 渲染完成后自动打开 PDF */
  open: false,
};

function toNumber(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

/** 把 margin 的各种写法统一成 {top,right,bottom,left} mm */
export function resolveMargin(margin) {
  if (typeof margin === 'string') {
    const key = margin.trim();
    if (MARGIN_PRESETS[key]) return { ...MARGIN_PRESETS[key] };
    const n = parseFloat(key);
    if (Number.isFinite(n)) return { top: n, right: n, bottom: n, left: n };
    return { ...MARGIN_PRESETS.normal };
  }
  if (typeof margin === 'number') {
    return { top: margin, right: margin, bottom: margin, left: margin };
  }
  if (margin && typeof margin === 'object') {
    const base = { ...MARGIN_PRESETS.normal };
    for (const k of ['top', 'right', 'bottom', 'left']) {
      if (margin[k] != null) base[k] = toNumber(margin[k], base[k]);
    }
    return base;
  }
  return { ...MARGIN_PRESETS.normal };
}

export function resolvePaper(paper) {
  const key = String(paper || 'A4');
  const found = Object.keys(PAPER_SIZES).find((k) => k.toLowerCase() === key.toLowerCase());
  return { name: found || 'A4', ...(PAPER_SIZES[found] || PAPER_SIZES.A4) };
}

export function normalizeOptions(input = {}) {
  const o = { ...DEFAULTS };
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null) o[k] = v;
  }

  o.paperInfo = resolvePaper(o.paper);
  o.landscape = !!o.landscape;
  o.marginInfo = resolveMargin(o.margin);
  o.fontSize = toNumber(o.fontSize, DEFAULTS.fontSize);
  o.lineHeight = toNumber(o.lineHeight, DEFAULTS.lineHeight);
  o.textIndent = toNumber(o.textIndent, 0);
  o.theme = THEMES.includes(o.theme) ? o.theme : 'print';
  o.tableLines = o.tableLines === 'rules' ? 'rules' : 'grid';
  o.textAlign = o.textAlign === 'justify' ? 'justify' : 'left';
  o.toc = !!o.toc;
  o.pageNumbers = o.pageNumbers !== false;
  o.pageBreakOnH1 = !!o.pageBreakOnH1;
  return o;
}

/** 纸张实际宽高（考虑横向） */
export function pageDimensions(o) {
  const { w, h } = o.paperInfo;
  return o.landscape ? { width: h, height: w } : { width: w, height: h };
}

/** 内容区可用宽度（mm） */
export function contentWidthmm(o) {
  const { width } = pageDimensions(o);
  return width - o.marginInfo.left - o.marginInfo.right;
}
