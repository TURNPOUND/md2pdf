/**
 * 定位系统里可用的 Chromium 内核浏览器（Edge / Chrome / Brave ...）
 * 找不到就报一句人话，不让用户去猜
 */
import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: [
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
};

function expand(p) {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
}

function firstExisting(list) {
  for (const raw of list) {
    const p = expand(raw);
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** PATH 里找一遍（用户可能装在奇怪的地方） */
function fromPath() {
  const names =
    process.platform === 'win32'
      ? ['msedge.exe', 'chrome.exe', 'brave.exe']
      : ['microsoft-edge', 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    for (const n of names) {
      const p = path.join(d, n);
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

let cached = undefined;

export function findChrome() {
  if (cached !== undefined) return cached;
  if (process.env.MD2PDF_BROWSER && fs.existsSync(process.env.MD2PDF_BROWSER)) {
    cached = process.env.MD2PDF_BROWSER;
    return cached;
  }
  const list = CANDIDATES[process.platform] || CANDIDATES.linux;
  cached = firstExisting(list) || fromPath() || null;
  return cached;
}

export function browserRequiredMessage() {
  return [
    '没有找到可用的 Chromium 内核浏览器（Edge 或 Chrome）。',
    '本工具需要浏览器来把 HTML 排成 PDF，请任选一种解决：',
    '  1) 安装 Microsoft Edge（Windows 10/11 通常自带）',
    '  2) 安装 Google Chrome',
    '  3) 设置环境变量 MD2PDF_BROWSER 指向浏览器 exe 的完整路径',
  ].join('\n');
}
