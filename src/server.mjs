/**
 * 本地图形界面服务器（零依赖，只听 127.0.0.1）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { markdownToHtml, cacheDir } from './pipeline.mjs';
import { Renderer, buildPdfOptions } from './renderer.mjs';
import { normalizeOptions } from './config.mjs';
import { findChrome } from './browser.mjs';
import { ensureMermaidAsset, buildHtml } from './template.mjs';
import { renderMarkdown } from './core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const MAX_BODY = 24 * 1024 * 1024;
const STARTED_AT = new Date();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function sendJson(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** 把 HTML 里的 file:// 图片改写成 /api/asset 代理，让预览能显示本地图；
 *  srcdoc 里解析不了相对路径，Mermaid 脚本单独走 /api/mermaid.js */
function rewriteAssetsForPreview(html) {
  return html
    .replace(/<script src="\.\/mermaid\.min\.js"><\/script>/g, '<script src="/api/mermaid.js"></script>')
    .replace(/(src|href)="file:\/\/\/([^"]+)"/g, (m, attr, p) => {
      try {
        const decoded = decodeURIComponent(p).replace(/\//g, path.sep === '\\' ? '\\' : '/');
        return `${attr}="/api/asset?p=${encodeURIComponent(decoded)}"`;
      } catch {
        return m;
      }
    });
}

export async function startServer({ port = 7361, open = false, maxPortTries = 20 } = {}) {
  const renderer = new Renderer();
  let currentPort = port;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${currentPort}`);
    const p = url.pathname;

    try {
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
        const file = path.join(PUBLIC_DIR, 'index.html');
        const buf = fs.readFileSync(file);
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
        res.end(buf);
        return;
      }

      if (req.method === 'GET' && p === '/api/info') {
        sendJson(res, 200, {
          version: PKG.version,
          browser: findChrome(),
          platform: process.platform,
          node: process.version,
          startedAt: STARTED_AT.toISOString(),
        });
        return;
      }

      // 预览时的 Mermaid 运行时（srcdoc 无法加载相对路径脚本）
      if (req.method === 'GET' && p === '/api/mermaid.js') {
        const candidates = [
          path.join(__dirname, '..', 'assets', 'mermaid.min.js'),
          path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
        ];
        const found = candidates.find((f) => fs.existsSync(f));
        if (!found) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('mermaid runtime not found');
          return;
        }
        const buf = fs.readFileSync(found);
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Content-Length': buf.length, 'Cache-Control': 'max-age=3600' });
        res.end(buf);
        return;
      }

      // 本地图片代理（仅预览用）
      if (req.method === 'GET' && p === '/api/asset') {        const target = url.searchParams.get('p') || '';
        const ext = path.extname(target).toLowerCase();
        const real = path.resolve(target);
        if (!fs.existsSync(real) || !fs.statSync(real).isFile()) {
          res.writeHead(404).end('not found');
          return;
        }
        const buf = fs.readFileSync(real);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(buf);
        return;
      }

      if (req.method === 'POST' && p === '/api/preview') {
        const body = await readBody(req);
        const options = normalizeOptions(body.options || {});
        const bodyHtml = await renderMarkdown(String(body.markdown || ''), {
          ...body.options,
          mermaid: options.mermaid,
          highlight: options.highlight,
          katex: options.katex,
          toc: options.toc,
          pageBreakOnH1: options.pageBreakOnH1,
          baseDir: body.baseDir || process.cwd(),
          fallbackTitle: body.filename ? String(body.filename).replace(/\.[^.]+$/, '') : '预览',
        });
        const html = await buildHtml({
          bodyHtml: bodyHtml.html,
          options,
          title: bodyHtml.title,
          author: bodyHtml.author,
          hasMermaid: bodyHtml.hasMermaid,
          hasMath: bodyHtml.hasMath,
        });
        sendJson(res, 200, { html: rewriteAssetsForPreview(html), title: bodyHtml.title });
        return;
      }

      if (req.method === 'POST' && p === '/api/pdf') {
        const body = await readBody(req);
        const options = normalizeOptions(body.options || {});
        const markdown = String(body.markdown || '');
        const fallbackTitle = body.filename ? String(body.filename).replace(/\.[^.]+$/, '') : '文档';

        const rendered = await renderMarkdown(markdown, {
          ...body.options,
          mermaid: options.mermaid,
          highlight: options.highlight,
          katex: options.katex,
          toc: options.toc,
          pageBreakOnH1: options.pageBreakOnH1,
          baseDir: body.baseDir || process.cwd(),
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
        const htmlPath = path.join(dir, `gui-${crypto.randomBytes(6).toString('hex')}.html`);
        fs.writeFileSync(htmlPath, html, 'utf8');

        const pdfPath = path.join(dir, `gui-${crypto.randomBytes(6).toString('hex')}.pdf`);
        try {
          await renderer.launch();
          const pdfOptions = buildPdfOptions(options, {
            headerText: options.headerText || rendered.title || '',
            footerText: options.footerText || '',
            pdfPath,
          });
          const result = await renderer.render(htmlPath, pdfOptions);
          const buf = fs.readFileSync(pdfPath);
          const name = (rendered.title || fallbackTitle || 'document').replace(/[\\/:*?"<>|]/g, '_');
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
            'Content-Length': buf.length,
            'X-Warnings': encodeURIComponent(JSON.stringify(result.warnings || [])),
          });
          res.end(buf);
        } finally {
          for (const f of [htmlPath, pdfPath]) {
            try {
              fs.unlinkSync(f);
            } catch {
              /* ignore */
            }
          }
        }
        return;
      }

      // 静态文件
      if (req.method === 'GET') {
        const rel = p.replace(/^\/+/, '');
        const file = path.join(PUBLIC_DIR, rel);
        if (file.startsWith(PUBLIC_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
          res.end(fs.readFileSync(file));
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    } catch (err) {
      const msg = err && err.code === 'NO_BROWSER' ? err.message : err && err.message ? err.message : String(err);
      sendJson(res, 500, { error: msg });
    }
  });

  // 端口占用自动往后找
  const listen = (tryPort, attempt) =>
    new Promise((resolve, reject) => {
      const onError = (e) => {
        server.removeListener('error', onError);
        if (e.code === 'EADDRINUSE' && attempt < maxPortTries) resolve(listen(tryPort + 1, attempt + 1));
        else reject(e);
      };
      server.once('error', onError);
      server.listen(tryPort, '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve(tryPort);
      });
    });

  currentPort = await listen(port, 0);
  const siteUrl = `http://127.0.0.1:${currentPort}`;

  if (open) openUrl(siteUrl);

  const close = async () => {
    await renderer.close().catch(() => {});
    await new Promise((r) => server.close(r));
  };

  console.log(`\n  Markdown 转 PDF  ${siteUrl}`);
  console.log('  关闭这个窗口即退出\n');

  return { url: siteUrl, port: currentPort, close, server };
}

function openUrl(u) {
  try {
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', u], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [u], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [u], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* ignore */
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  startServer({ open: process.argv.includes('--open') }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
