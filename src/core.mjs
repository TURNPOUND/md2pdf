/**
 * 核心：Markdown -> HTML 片段
 * 负责：BOM/换行归一化、YAML front matter、插件装配、代码高亮、
 *      Mermaid 块保留、图片路径解析、目录生成、标题提取
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import * as yamlModule from 'js-yaml';
import MarkdownIt from 'markdown-it';

// js-yaml 在不同版本下 default/named 导出不一致，两种都兜住
const yaml = yamlModule.default ?? yamlModule;

let pluginsPromise = null;

/** 各家包的导出形态不一致（CJS/默认互套），统一剥到真身 */
function unwrap(mod) {
  let v = mod;
  for (let i = 0; i < 3; i++) {
    if (v && typeof v === 'object' && v.default != null && (typeof v.default === 'function' || typeof v.default === 'object')) {
      v = v.default;
    } else break;
  }
  return v;
}

/** 插件按需加载，任何一个失败都不影响主链路 */
async function loadPlugins() {
  if (pluginsPromise) return pluginsPromise;
  pluginsPromise = (async () => {
    const out = { anchor: null, footnote: null, taskLists: null, katex: null, hljs: null };
    const tryLoad = async (name, key) => {
      try {
        const v = unwrap(await import(name));
        out[key] = v;
      } catch (err) {
        out[key] = null;
      }
    };
    await Promise.all([
      tryLoad('markdown-it-anchor', 'anchor'),
      tryLoad('markdown-it-footnote', 'footnote'),
      tryLoad('markdown-it-task-lists', 'taskLists'),
      tryLoad('@vscode/markdown-it-katex', 'katex'),
    ]);
    try {
      // common 版本体积远小于全量，覆盖主流语言
      out.hljs = unwrap(await import('highlight.js/lib/common'));
    } catch {
      out.hljs = null;
    }
    for (const k of Object.keys(out)) {
      if (out[k] && typeof out[k] !== 'function' && k !== 'hljs') out[k] = null;
    }
    return out;
  })();
  return pluginsPromise;
}

export function stripBom(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function normalizeText(raw) {
  return stripBom(String(raw ?? '')).replace(/\r\n?/g, '\n');
}

/** 切分 YAML front matter */
export function splitFrontMatter(src) {
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { meta: {}, content: src };
  try {
    const meta = yaml.load(m[1]);
    return { meta: meta && typeof meta === 'object' ? meta : {}, content: src.slice(m[0].length) };
  } catch {
    // YAML 写坏了就当没有，绝不因此中断转换
    return { meta: {}, content: src };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** markdown 内图片/链接的相对路径 -> 绝对 file:// URL */
function resolveAssetUrl(src, baseDir) {
  if (!src) return src;
  const s = String(src).trim();
  if (/^(https?|data|file|mailto|#)/i.test(s)) return s;
  if (!baseDir) return s;
  const clean = decodeURI(s.replace(/^\.\//, ''));
  const abs = path.resolve(baseDir, clean);
  try {
    return pathToFileURL(abs).href;
  } catch {
    return s;
  }
}

function walkImages(tokens, baseDir) {
  for (const t of tokens) {
    if (t.type === 'inline' && Array.isArray(t.children)) {
      for (const c of t.children) {
        if (c.type === 'image') {
          const cur = c.attrGet('src');
          const next = resolveAssetUrl(cur, baseDir);
          if (next !== cur) c.attrSet('src', next);
        }
      }
    }
    if (Array.isArray(t.children) && t.children.length && t.type !== 'inline') {
      walkImages(t.children, baseDir);
    }
  }
}

function buildTocHtml(headings, md, minLevel = 2, maxLevel = 3) {
  const items = headings.filter((h) => h.level >= minLevel && h.level <= maxLevel && h.id);
  if (!items.length) return '';

  const root = { level: minLevel - 1, children: [] };
  const stack = [{ level: minLevel - 1, node: root }];
  for (const it of items) {
    const node = { ...it, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ level: it.level, node });
  }

  const render = (nodes) => {
    if (!nodes.length) return '';
    const lis = nodes
      .map((n) => {
        const sub = render(n.children);
        return `<li class="toc-item toc-l${n.level}"><a href="#${escapeHtml(n.id)}">${escapeHtml(n.text)}</a>${sub}</li>`;
      })
      .join('');
    return `<ol class="toc-list">${lis}</ol>`;
  };

  return `<nav class="toc"><h2 class="toc-title">目录</h2>${render(root.children)}</nav>`;
}

/**
 * 把 markdown 渲染为 HTML 片段
 * @returns {Promise<{html:string, headings:Array, title:string|null, meta:object, hasMermaid:boolean, hasMath:boolean}>}
 */
export async function renderMarkdown(rawSource, opts = {}) {
  const source = normalizeText(rawSource);
  const { meta, content } = splitFrontMatter(source);
  const baseDir = opts.baseDir || process.cwd();
  const plugins = await loadPlugins();

  const md = new MarkdownIt({
    html: true, // 需要它才能写 <u> 下划线、<br>、<img> 等内联 HTML
    linkify: true,
    typographer: true,
    breaks: false,
    ...(opts.markdownItOptions || {}),
  });

  if (plugins.anchor) {
    md.use(plugins.anchor, {
      level: [1, 2, 3, 4],
      slugify: (s) =>
        String(s)
          .trim()
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\- ]+/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 80) || 'section',
      uniqueSlugStartIndex: 1,
      permalink: false,
    });
  }
  if (plugins.footnote) md.use(plugins.footnote);
  if (plugins.taskLists) md.use(plugins.taskLists, { enabled: true, label: true, labelAfter: true });
  if (plugins.katex && opts.katex !== false) {
    md.use(plugins.katex, { throwOnError: false, errorColor: '#cc0000', output: 'html' });
  }

  const hljs = plugins.hljs;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const lang = info.split(/\s+/)[0] || '';
    const code = token.content;
    const o = env.opts || {};

    if (lang === 'mermaid' && o.mermaid !== false) {
      env.hasMermaid = true;
      return `<div class="mermaid">${escapeHtml(code)}</div>\n`;
    }

    let highlighted = '';
    let cls = 'hljs';
    if (o.highlight !== false && hljs && lang && hljs.getLanguage(lang)) {
      try {
        highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        cls += ` language-${lang}`;
      } catch {
        highlighted = '';
      }
    }
    if (!highlighted) {
      highlighted = escapeHtml(code);
      if (lang) cls += ` language-${escapeHtml(lang)}`;
    }
    return `<pre class="code-block" data-lang="${escapeHtml(lang)}"><code class="${cls}">${highlighted}</code></pre>\n`;
  };

  const env = { opts: { ...opts, mermaid: opts.mermaid !== false, highlight: opts.highlight !== false }, baseDir };
  const tokens = md.parse(content, env);
  walkImages(tokens, baseDir);

  // 标题收集（用渲染后的行内 HTML 去掉标签，避免目录里出现 ** 之类）
  const headings = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue;
    const level = Number(tokens[i].tag.slice(1));
    const id = tokens[i].attrGet('id') || '';
    const inline = tokens[i + 1] && tokens[i + 1].type === 'inline' ? tokens[i + 1] : null;
    const text = inline ? stripTags(md.renderer.renderInline(inline.children, md.options, env)) : '';
    headings.push({ level, id, text });
  }

  // 一级标题自动分页（可选）
  let html = md.renderer.render(tokens, md.options, env);
  if (opts.pageBreakOnH1) {
    html = html.replace(/<h1(\s|>)/g, '<div class="page-break"></div><h1$1');
  }

  const hasMath = /class="katex/.test(html) || /katex-display/.test(html);
  const hasMermaid = !!env.hasMermaid;

  // 标题优先级：选项 > front matter > 首个 h1 > 调用方给的文件名
  const h1 = headings.find((h) => h.level === 1);
  const title =
    (opts.title && String(opts.title).trim()) ||
    (meta.title && String(meta.title).trim()) ||
    (h1 && h1.text) ||
    (opts.fallbackTitle && String(opts.fallbackTitle).trim()) ||
    null;

  if (opts.toc) {
    const tocHtml = buildTocHtml(headings, md, opts.tocMinLevel ?? 1, opts.tocMaxLevel ?? 3);
    if (tocHtml) html = tocHtml + html;
  }

  return {
    html,
    headings,
    title,
    meta,
    hasMermaid,
    hasMath,
    author: (opts.author && String(opts.author)) || (meta.author && String(meta.author)) || null,
  };
}

export function safeReadFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return normalizeText(raw);
}
