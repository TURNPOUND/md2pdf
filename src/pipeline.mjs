/**
 * 把 core / template / renderer 串成一次完整的转换
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { renderMarkdown, safeReadFile } from './core.mjs';
import { buildHtml, ensureMermaidAsset } from './template.mjs';
import { Renderer, buildPdfOptions } from './renderer.mjs';
import { normalizeOptions } from './config.mjs';

export function cacheDir() {
  const dir = process.env.MD2PDF_CACHE || path.join(os.tmpdir(), 'md2pdf-cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Markdown -> HTML 字符串（不落盘，GUI 预览也用它） */
export async function markdownToHtml(rawSource, opts = {}) {
  const options = normalizeOptions(opts);
  const baseDir = opts.baseDir || process.cwd();
  const body = await renderMarkdown(rawSource, {
    ...opts,
    mermaid: options.mermaid,
    highlight: options.highlight,
    katex: options.katex,
    toc: options.toc,
    pageBreakOnH1: options.pageBreakOnH1,
    baseDir,
  });
  const html = await buildHtml({
    bodyHtml: body.html,
    options,
    title: body.title,
    author: body.author,
    hasMermaid: body.hasMermaid,
    hasMath: body.hasMath,
  });
  return { html, meta: body, options };
}

/**
 * 转换单个 .md 文件
 * @param {string} inputPath
 * @param {string|null} outputPath
 * @param {object} opts 配置项
 * @param {{renderer?: Renderer, keepHtml?: boolean}} ctx
 */
export async function convertFile(inputPath, outputPath, opts = {}, ctx = {}) {
  const absIn = path.resolve(inputPath);
  if (!fs.existsSync(absIn)) throw new Error(`输入文件不存在：${absIn}`);

  const options = normalizeOptions(opts);
  const baseDir = path.dirname(absIn);
  const fallbackTitle = path.basename(absIn, path.extname(absIn));
  const raw = safeReadFile(absIn);

  const rendered = await renderMarkdown(raw, {
    ...opts,
    mermaid: options.mermaid,
    highlight: options.highlight,
    katex: options.katex,
    toc: options.toc,
    pageBreakOnH1: options.pageBreakOnH1,
    baseDir,
    fallbackTitle,
  });

  const html = await buildHtml({
    bodyHtml: rendered.html,
    options,
    title: rendered.title,
    author: rendered.author,
    hasMermaid: rendered.hasMermaid,
    hasMath: rendered.hasMath,
  });

  const dir = cacheDir();
  if (rendered.hasMermaid) ensureMermaidAsset(dir);
  const htmlPath = path.join(dir, `render-${crypto.randomBytes(6).toString('hex')}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const absOut = path.resolve(outputPath || absIn.replace(/\.(md|markdown|mdown|txt)$/i, '') + '.pdf');
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const own = !ctx.renderer;
  const renderer = ctx.renderer || new Renderer({ verbose: opts.verbose });
  const headerText = options.headerText || rendered.title || '';
  const footerText = options.footerText || '';
  const warnings = [];

  try {
    const pdfOptions = buildPdfOptions(options, { headerText, footerText, pdfPath: absOut });
    const res = await renderer.render(htmlPath, pdfOptions);
    warnings.push(...(res.warnings || []));
  } finally {
    if (own) await renderer.close().catch(() => {});
    if (!ctx.keepHtml) {
      try {
        fs.unlinkSync(htmlPath);
      } catch {
        /* ignore */
      }
    }
  }

  return {
    input: absIn,
    output: absOut,
    title: rendered.title,
    warnings,
    hasMermaid: rendered.hasMermaid,
    hasMath: rendered.hasMath,
  };
}

/** 批量转换，复用同一个浏览器实例 */
export async function convertFiles(jobs, opts = {}, { onProgress } = {}) {
  const renderer = new Renderer({ verbose: opts.verbose });
  const results = [];
  try {
    await renderer.launch();
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const input = typeof job === 'string' ? job : job.input;
      const output = typeof job === 'string' ? null : job.output;
      if (onProgress) onProgress({ index: i, total: jobs.length, input, phase: 'start' });
      try {
        const r = await convertFile(input, output, opts, { renderer });
        results.push({ ok: true, ...r });
        if (onProgress) onProgress({ index: i, total: jobs.length, input, phase: 'done', result: r });
      } catch (err) {
        const fail = { ok: false, input, error: err && err.message ? err.message : String(err) };
        results.push(fail);
        if (onProgress) onProgress({ index: i, total: jobs.length, input, phase: 'error', error: fail.error });
      }
    }
  } finally {
    await renderer.close().catch(() => {});
  }
  return results;
}
