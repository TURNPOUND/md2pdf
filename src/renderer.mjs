/**
 * HTML -> PDF：用 puppeteer-core 驱动系统浏览器
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, browserRequiredMessage } from './browser.mjs';
import { buildHeaderTemplate, buildFooterTemplate } from './template.mjs';
import { pageDimensions } from './config.mjs';

let puppeteerModule = null;
async function getPuppeteer() {
  if (puppeteerModule) return puppeteerModule;
  const mod = await import('puppeteer-core');
  puppeteerModule = mod.default ?? mod;
  return puppeteerModule;
}

export function buildPdfOptions(options, { headerText, footerText, pdfPath }) {
  const dims = pageDimensions(options);
  const m = options.marginInfo;
  const wantHeader = !!headerText;
  const wantFooter = !!footerText || options.pageNumbers;
  const displayHeaderFooter = wantHeader || wantFooter;

  return {
    path: pdfPath || undefined,
    width: `${dims.width}mm`,
    height: `${dims.height}mm`,
    margin: {
      top: `${m.top}mm`,
      right: `${m.right}mm`,
      bottom: `${m.bottom}mm`,
      left: `${m.left}mm`,
    },
    printBackground: true,
    displayHeaderFooter,
    headerTemplate: wantHeader
      ? buildHeaderTemplate({ text: headerText, margin: m })
      : '<div style="font-size:0"></div>',
    footerTemplate: wantFooter
      ? buildFooterTemplate({ text: footerText, showPageNumbers: options.pageNumbers, margin: m })
      : '<div style="font-size:0"></div>',
    scale: 1,
    preferCSSPageSize: false,
    timeout: 60_000,
  };
}

export class Renderer {
  constructor({ executablePath, verbose = false } = {}) {
    this.executablePath = executablePath || findChrome();
    this.verbose = verbose;
    this.browser = null;
    this._closing = false;
  }

  async launch() {
    if (this.browser) return this.browser;
    if (!this.executablePath) {
      const err = new Error(browserRequiredMessage());
      err.code = 'NO_BROWSER';
      throw err;
    }
    const puppeteer = await getPuppeteer();
    this.browser = await puppeteer.launch({
      executablePath: this.executablePath,
      headless: true,
      args: [
        '--allow-file-access-from-files',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--disable-features=CalculateNativeWinOcclusion',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    return this.browser;
  }

  /**
   * @param {string} htmlPath 本地 HTML 绝对路径
   * @param {object} pdfOptions buildPdfOptions 的结果
   * @returns {Promise<{warnings: string[]}>}
   */
  async render(htmlPath, pdfOptions) {
    const browser = await this.launch();
    const page = await browser.newPage();
    const warnings = [];
    try {
      page.setDefaultTimeout(60_000);

      const consoleErrors = [];
      page.on('pageerror', (e) => consoleErrors.push(String(e && e.message ? e.message : e)));
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const url = pathToFileURL(htmlPath).href;
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });

      // 等待公式/图表/字体就绪
      try {
        await page.waitForFunction('window.__md2pdfReady === true', { timeout: 15_000 });
      } catch {
        warnings.push('页面脚本未在 15 秒内完成（公式或图表可能未渲染完整），已强制继续导出');
      }

      for (const e of consoleErrors) {
        if (/Failed to load resource|about:invalid/i.test(e)) continue;
        warnings.push(`页面报错：${e}`);
      }

      await page.pdf(pdfOptions);
      return { warnings };
    } finally {
      await page.close().catch(() => {});
    }
  }

  async close() {
    this._closing = true;
    const b = this.browser;
    this.browser = null;
    if (b) await b.close().catch(() => {});
  }
}

/** 单文件便捷入口 */
export async function convertHtmlFile(htmlPath, pdfPath, options, { headerText, footerText, renderer } = {}) {
  const own = !renderer;
  const r = renderer || new Renderer();
  try {
    await r.launch();
    const pdfOptions = buildPdfOptions(options, { headerText, footerText, pdfPath });
    return await r.render(htmlPath, pdfOptions);
  } finally {
    if (own) await r.close().catch(() => {});
  }
}

export function ensureDirFor(file) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
}
