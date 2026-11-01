#!/usr/bin/env node
/**
 * 命令行入口
 * 用法：md2pdf 文件.md [选项]      也支持拖拽到 .cmd 启动器上
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { convertFiles } from './pipeline.mjs';
import { DEFAULTS } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const HELP = `
Markdown 转 PDF（为打印优化）  v${PKG.version}

用法:
  md2pdf <文件.md> [文件2.md ...] [选项]
  md2pdf <目录>                    # 递归转换目录下所有 .md
  md2pdf                           # 不带参数 = 启动图形界面

常用选项:
  -o, --output <路径>      输出文件（单文件）或输出目录（多文件）
  --theme <name>           default=彩印版  print=黑白省墨版（默认）
  --paper <size>           A4（默认）/ A5 / B5 / B4 / Letter / Legal
  --landscape              横向
  --margin <值>            normal / narrow / wide / book / 数字(mm)，默认 normal
  --font-size <pt>         正文字号，默认 ${DEFAULTS.fontSize}
  --line-height <倍数>     行高，默认 ${DEFAULTS.lineHeight}
  --indent <em>            首行缩进，如 2（中文公文风格），默认 0
  --justify                两端对齐

表格:
  --table-lines <grid|rules>   grid=完整网格(默认)  rules=只有横线

排版增强:
  --toc                    生成目录（单独一页）
  --page-break-h1          每个一级标题另起一页
  --no-page-numbers        不打印页码
  --header <文字>          页眉文字（默认用文档标题）
  --footer <文字>          页脚左侧文字
  --title <文字>           强制指定文档标题
  --no-mermaid             关闭 Mermaid 图表渲染
  --no-highlight           关闭代码高亮（纯黑白更省墨）

其它:
  --open                   转换完成后自动打开 PDF
  --keep-html              保留中间 HTML（排查样式用）
  --verbose                输出详细日志
  -h, --help               显示本帮助
  -v, --version            显示版本号

示例:
  md2pdf 报告.md --theme print --toc --open
  md2pdf docs/ -o D:\\输出 --paper A4 --margin book
`;

function parseArgs(argv) {
  const opts = { _: [] };
  const need = new Set([
    '-o', '--output', '--paper', '--margin', '--theme', '--font-size', '--line-height',
    '--indent', '--header', '--footer', '--title', '--table-lines',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) {
      opts._.push(a);
      continue;
    }
    const [flag, inlineVal] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, null];
    const take = () => (inlineVal != null ? inlineVal : argv[++i]);
    switch (flag) {
      case '-o': case '--output': opts.output = take(); break;
      case '--paper': opts.paper = take(); break;
      case '--margin': opts.margin = take(); break;
      case '--theme': opts.theme = take(); break;
      case '--font-size': opts.fontSize = parseFloat(take()); break;
      case '--line-height': opts.lineHeight = parseFloat(take()); break;
      case '--indent': opts.textIndent = parseFloat(take()); break;
      case '--header': opts.headerText = take(); break;
      case '--footer': opts.footerText = take(); break;
      case '--title': opts.title = take(); break;
      case '--table-lines': opts.tableLines = take(); break;
      case '--landscape': opts.landscape = true; break;
      case '--justify': opts.textAlign = 'justify'; break;
      case '--toc': opts.toc = true; break;
      case '--page-break-h1': opts.pageBreakOnH1 = true; break;
      case '--no-page-numbers': opts.pageNumbers = false; break;
      case '--no-mermaid': opts.mermaid = false; break;
      case '--no-highlight': opts.highlight = false; break;
      case '--open': opts.open = true; break;
      case '--keep-html': opts.keepHtml = true; break;
      case '--verbose': opts.verbose = true; break;
      case '-h': case '--help': opts.help = true; break;
      case '-v': case '--version': opts.version = true; break;
      default: {
        // 允许 --foo 之外的未知项直接报错，避免静默忽略
        const err = new Error(`未知选项：${flag}（用 --help 查看全部参数）`);
        err.code = 'BAD_ARGS';
        throw err;
      }
    }
  }
  return opts;
}

function collectMarkdownFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [path.resolve(target)];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...collectMarkdownFiles(full));
    else if (/\.(md|markdown|mdown)$/i.test(entry.name)) out.push(path.resolve(full));
  }
  return out;
}

function openFile(p) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', p], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [p], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [p], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    /* 打不开就算了，不因此报错 */
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.version) {
    console.log(PKG.version);
    return;
  }

  // 无参数 -> 启动图形界面
  if (opts._.length === 0) {
    const { startServer } = await import('./server.mjs');
    await startServer({ open: true });
    return;
  }

  // 收集输入
  const inputs = [];
  for (const p of opts._) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) {
      console.error(`跳过不存在的路径：${abs}`);
      continue;
    }
    inputs.push(...collectMarkdownFiles(abs));
  }
  if (!inputs.length) {
    console.error('没有找到任何 .md 文件。');
    process.exit(1);
  }

  // 计算输出路径
  const outArg = opts.output ? path.resolve(opts.output) : null;
  const outIsExistingDir = outArg && fs.existsSync(outArg) && fs.statSync(outArg).isDirectory();
  const outLooksLikeFile = outArg && /\.pdf$/i.test(outArg);
  // 多输入 / 输入是目录 / 输出已存在且是目录 / 输出没给 .pdf 后缀 -> 一律当目录
  const treatAsDir = !!outArg && (
    opts._.length > 1 ||
    inputs.length > 1 ||
    outIsExistingDir ||
    !outLooksLikeFile
  );

  const jobs = inputs.map((input) => {
    const base = path.basename(input).replace(/\.(md|markdown|mdown)$/i, '');
    let output = input.replace(/\.(md|markdown|mdown)$/i, '') + '.pdf';
    if (outArg && treatAsDir) {
      output = path.join(outArg, base + '.pdf');
    } else if (outArg && !treatAsDir) {
      output = outArg;
    }
    return { input, output };
  });

  const t0 = Date.now();
  console.log(`开始转换 ${jobs.length} 个文件…`);

  const results = await convertFiles(jobs, opts, {
    onProgress: ({ index, total, input, phase, result, error }) => {
      const n = `[${index + 1}/${total}]`;
      if (phase === 'start') console.log(`${n} ${path.basename(input)}`);
      if (phase === 'done') {
        const size = fs.existsSync(result.output) ? humanSize(fs.statSync(result.output).size) : '';
        console.log(`      -> ${result.output}  ${size}`);
        for (const w of result.warnings || []) console.log(`      ! ${w}`);
      }
      if (phase === 'error') console.error(`      转换失败：${error}`);
    },
  });

  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  const cost = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n完成 ${ok.length}/${results.length}，用时 ${cost}s`);
  if (bad.length) {
    console.error(`失败 ${bad.length} 个：`);
    for (const b of bad) console.error(`  - ${b.input}: ${b.error}`);
    process.exitCode = 1;
  }

  if (opts.open && ok.length) {
    openFile(ok[0].output);
  }
}

main().catch((err) => {
  if (err && err.code === 'NO_BROWSER') {
    console.error(`\n${err.message}\n`);
  } else {
    console.error(`\n出错了：${err && err.stack ? err.stack : err}\n`);
  }
  process.exit(1);
});
