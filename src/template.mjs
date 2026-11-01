/**
 * HTML 骨架组装：CSS 变量注入、主题内联、KaTeX 样式（含字体 data URI）、Mermaid 注入
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { contentWidthmm, pageDimensions } from './config.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

/** 极简 reset，避免依赖任何 normalize 库 */
const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;padding:0}
img{max-width:100%;height:auto}
svg{max-width:100%}
table{border-collapse:collapse;max-width:100%}
/* anywhere 会参与 min-content 宽度计算，避免超长 URL/英文串把相邻列挤扁；
   表头不折行，防止「是否支持」被挤成两行 */
body table td,body table th{overflow-wrap:anywhere}
body table th{white-space:nowrap}
hr{border:none}
.page-break{break-after:page;page-break-after:always;height:0;margin:0;padding:0}
.mermaid{text-align:center;break-inside:avoid;page-break-inside:avoid;margin:1em 0}
.mermaid svg{max-width:100%;height:auto}
.katex-display{margin:.8em 0;overflow-x:auto;overflow-y:hidden}
.katex{font-size:1.05em}
nav.toc{break-after:page;page-break-after:always}
nav.toc .toc-list{list-style:none;padding-left:0;margin:0}
nav.toc .toc-list .toc-list{padding-left:1.4em}
nav.toc .toc-item{margin:.28em 0;break-inside:avoid}
nav.toc a{text-decoration:none;color:inherit}
nav.toc .toc-title{margin:0 0 .8em;font-size:1.35em}
.doc-header{margin-bottom:1.6em;break-after:avoid}
.doc-header .doc-title{margin:0 0 .3em}
.doc-header .doc-meta{font-size:.85em;color:#666}
`;

let katexCssCache = null;

/** 把 KaTeX 样式内联，字体转 data URI —— 彻底摆脱 file:// 与相对路径问题 */
export function getKatexCss() {
  if (katexCssCache !== null) return katexCssCache;
  try {
    const cssPath = require.resolve('katex/dist/katex.min.css');
    const fontDir = path.join(path.dirname(cssPath), 'fonts');
    let css = fs.readFileSync(cssPath, 'utf8');

    // 只保留 woff2（体积小、Edge/Chrome 都支持），其余格式整段删除
    css = css.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("[^"]+"\)/g, '');

    css = css.replace(/url\(fonts\/([^)]+)\)/g, (match, file) => {
      if (!/\.woff2$/i.test(file)) return 'url(about:invalid)';
      try {
        const buf = fs.readFileSync(path.join(fontDir, file));
        return `url(data:font/woff2;base64,${buf.toString('base64')})`;
      } catch {
        return 'url(about:invalid)';
      }
    });
    katexCssCache = css;
  } catch {
    katexCssCache = '';
  }
  return katexCssCache;
}

export function readThemeCss(theme) {
  const name = theme === 'default' ? 'default.css' : 'print.css';
  const file = path.join(__dirname, 'themes', name);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** 主题 CSS 文件缺失时的最小兜底，保证任何情况下都不出白页 */
const FALLBACK_CSS = `
body{font-family:var(--body-font);font-size:var(--font-size);line-height:var(--line-height);color:#111}
h1,h2,h3,h4{font-family:var(--heading-font);break-after:avoid;page-break-after:avoid}
pre{background:#f6f7f9;border:1px solid #dde1e6;border-radius:4px;padding:10px;overflow:hidden;break-inside:avoid}
code{font-family:var(--mono-font)}
pre code{white-space:pre-wrap;word-break:break-word}
table{width:100%;border:1px solid #ccc}
th,td{border:1px solid #ccc;padding:6px 8px;word-break:break-word;overflow-wrap:anywhere}
blockquote{border-left:4px solid #ccc;margin:1em 0;padding:.2em 1em;color:#444}
`;

function cssVars(o) {
  const fonts = {
    body:
      o.theme === 'print'
        ? `"Source Han Serif SC","SimSun","Songti SC","Noto Serif CJK SC","Microsoft YaHei",serif`
        : `"Source Han Sans SC","Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`,
    heading: `"Source Han Sans SC","Microsoft YaHei","PingFang SC",sans-serif`,
    mono: `"Cascadia Mono","Consolas","JetBrains Mono","Courier New",monospace`,
  };
  // 网格线颜色：黑白版要够深才印得出来，彩色版可以淡一点
  const tableLine = o.theme === 'print' ? '#8f8f8f' : '#c9d1d9';
  return `
:root{
  --font-size:${o.fontSize}pt;
  --line-height:${o.lineHeight};
  --body-font:${o.bodyFont || fonts.body};
  --heading-font:${o.headingFont || fonts.heading};
  --mono-font:${o.monoFont || fonts.mono};
  --text-indent:${o.textIndent}em;
  --text-align:${o.textAlign};
  --accent:${o.accent};
  --table-line:${o.tableLine || tableLine};
  --content-width:${contentWidthmm(o)}mm;
  --page-width:${pageDimensions(o).width}mm;
  --page-height:${pageDimensions(o).height}mm;
}`;
}

/** 表格网格线：放在主题样式之后，靠更高优先级覆盖主题的“只有横线” */
function tableGridCss(o) {
  if (o.tableLines !== 'grid') return '';
  return `
body[data-table-lines="grid"] table{border:2px solid var(--accent,#000)}
body[data-table-lines="grid"] table th,
body[data-table-lines="grid"] table td{border:1px solid var(--table-line,#8f8f8f)}
body[data-table-lines="grid"] table thead th{border-bottom:2px solid var(--accent,#000)}
body[data-table-lines="grid"] table tbody tr:last-child td{border-bottom:0}
body[data-table-lines="grid"] table tfoot td{border-top:2px solid var(--accent,#000)}
`;
}

function mermaidScriptTag() {
  return `<script src="./mermaid.min.js"></script>`;
}

function readinessScript(hasMermaid) {
  return `<script>
(function(){
  window.__md2pdfReady = false;
  window.__md2pdfErrors = [];
  function done(){ window.__md2pdfReady = true; }
  function fail(e){ window.__md2pdfErrors.push(String(e && e.stack || e)); done(); }
  try {
    var jobs = [];
    if (document.fonts && document.fonts.ready) jobs.push(document.fonts.ready);
    ${
      hasMermaid
        ? `if (window.mermaid) {
      try {
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', fontFamily: 'var(--body-font)' });
        jobs.push(mermaid.run({ querySelector: '.mermaid' }).catch(fail));
      } catch (e) { fail(e); }
    }`
        : ''
    }
    if (!jobs.length) { done(); return; }
    Promise.all(jobs).then(function(){
      // 让浏览器完成一次布局，确保分页测量稳定
      requestAnimationFrame(function(){ requestAnimationFrame(done); });
    }).catch(fail);
    // 兜底：无论发生什么，8 秒后放行
    setTimeout(done, 8000);
  } catch (e) { fail(e); }
})();
</script>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 组装完整 HTML
 */
export async function buildHtml({ bodyHtml, options, title, author, hasMermaid, hasMath, extraCss = '' }) {
  const themeCss = readThemeCss(options.theme) || FALLBACK_CSS;
  const katexCss = hasMath ? getKatexCss() : '';
  const header = title
    ? `<header class="doc-header"><h1 class="doc-title">${escapeHtml(title)}</h1>${author ? `<div class="doc-meta">${escapeHtml(author)}</div>` : ''}</header>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Markdown')}</title>
<style>${BASE_CSS}</style>
${katexCss ? `<style>${katexCss}</style>` : ''}
<style>${cssVars(options)}</style>
<style>${themeCss}</style>
<style>${tableGridCss(options)}</style>
${extraCss ? `<style>${extraCss}</style>` : ''}
</head>
<body data-table-lines="${options.tableLines || 'grid'}">
${header}
${bodyHtml}
${hasMermaid ? mermaidScriptTag() : ''}
${readinessScript(hasMermaid)}
</body>
</html>`;
}

/** 页眉模板（puppeteer displayHeaderFooter） */
export function buildHeaderTemplate({ text, margin, fontSize = 8 }) {
  if (!text) return '<div></div>';
  const l = margin.left;
  const r = margin.right;
  return `<div style="width:100%;padding:0 ${r}mm 0 ${l}mm;font-size:${fontSize}px;color:#8a8a8a;
    font-family:'Microsoft YaHei',sans-serif;display:flex;justify-content:flex-end;align-items:center;">
    <span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:62%;">${escapeHtml(text)}</span>
  </div>`;
}

/** 页脚模板：左侧自定义文字 + 右侧页码 */
export function buildFooterTemplate({ text, showPageNumbers, margin, fontSize = 8 }) {
  if (!text && !showPageNumbers) return '<div></div>';
  const l = margin.left;
  const r = margin.right;
  const left = `<span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:55%;">${escapeHtml(text || '')}</span>`;
  const right = showPageNumbers
    ? `<span>第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</span>`
    : '';
  return `<div style="width:100%;padding:0 ${r}mm 0 ${l}mm;font-size:${fontSize}px;color:#8a8a8a;
    font-family:'Microsoft YaHei',sans-serif;display:flex;justify-content:space-between;align-items:center;">
    ${left}${right}
  </div>`;
}

/** 把 mermaid.min.js 铺到缓存目录，供 HTML 相对引用 */
export function ensureMermaidAsset(cacheDir) {
  const target = path.join(cacheDir, 'mermaid.min.js');
  try {
    if (fs.existsSync(target) && fs.statSync(target).size > 1024) return target;
    // 优先用随包分发的精简副本，不依赖 node_modules 里庞大的 mermaid 包
    const candidates = [
      path.join(PROJECT_ROOT, 'assets', 'mermaid.min.js'),
      path.join(PROJECT_ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
    ];
    for (const src of candidates) {
      if (fs.existsSync(src)) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.copyFileSync(src, target);
        return target;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export { PROJECT_ROOT };
