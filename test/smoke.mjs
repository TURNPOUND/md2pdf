/**
 * 冒烟测试：只测逻辑，不启浏览器，跑得快
 * 用法：node test/smoke.mjs [--e2e]   （--e2e 会真的生成一次 PDF）
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, normalizeText, splitFrontMatter } from '../src/core.mjs';
import { normalizeOptions, resolveMargin, resolvePaper, pageDimensions } from '../src/config.mjs';
import { buildHtml, buildFooterTemplate } from '../src/template.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  ok   ${name}`);
    })
    .catch((err) => {
      failed++;
      failures.push({ name, message: err.message });
      console.log(`  FAIL ${name}\n       ${err.message}`);
    });
}

const opts = (extra = {}) => ({ baseDir: ROOT, ...extra });

console.log('\n[1] 文本预处理');

await check('剥离 UTF-8 BOM', () => {
  const withBom = '\uFEFF# 标题\n\n正文';
  assert.equal(normalizeText(withBom).charCodeAt(0), 35, 'BOM 应被剥掉，首字符应是 #');
});

await check('CRLF 归一化为 LF', () => {
  assert.ok(!normalizeText('# a\r\n\r\nb').includes('\r'));
});

await check('BOM 文件的首行标题仍然生效', async () => {
  const r = await renderMarkdown('\uFEFF# 我的标题\n\n内容', opts());
  assert.match(r.html, /<h1[^>]*>我的标题<\/h1>/);
});

console.log('\n[2] front matter');

await check('解析 title / author', () => {
  const { meta, content } = splitFrontMatter('---\ntitle: 报告\nauthor: 张三\n---\n\n正文');
  assert.equal(meta.title, '报告');
  assert.equal(meta.author, '张三');
  assert.equal(content.trim(), '正文');
});

await check('YAML 写坏了不崩，退化为正文', () => {
  const { meta } = splitFrontMatter('---\ntitle: [未闭合\n---\n正文');
  assert.deepEqual(meta, {});
});

await check('没有 front matter 时原样返回', () => {
  const src = '# 标题\n\n正文';
  assert.equal(splitFrontMatter(src).content, src);
});

console.log('\n[3] 行内格式');

await check('加粗 / 斜体 / 删除线', async () => {
  const r = await renderMarkdown('**粗** *斜* ~~删~~', opts());
  assert.match(r.html, /<strong>粗<\/strong>/);
  assert.match(r.html, /<em>斜<\/em>/);
  assert.match(r.html, /<s>删<\/s>/);
});

await check('下划线（内联 HTML <u>）', async () => {
  const r = await renderMarkdown('这是 <u>下划线</u> 文本', opts());
  assert.match(r.html, /<u>下划线<\/u>/);
});

await check('行内代码与链接', async () => {
  const r = await renderMarkdown('`code` 和 [链接](https://example.com)', opts());
  assert.match(r.html, /<code>code<\/code>/);
  assert.match(r.html, /href="https:\/\/example.com"/);
});

console.log('\n[4] 块级结构');

await check('代码块 + 语法高亮', async () => {
  const r = await renderMarkdown('```js\nconst a = 1;\n```', opts());
  assert.match(r.html, /<pre class="code-block"/);
  assert.match(r.html, /hljs-keyword/);
});

await check('未知语言的代码块不报错', async () => {
  const r = await renderMarkdown('```unknownlang\nraw <b>text</b>\n```', opts());
  assert.match(r.html, /&lt;b&gt;text&lt;\/b&gt;/);
});

await check('表格渲染', async () => {
  const r = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', opts());
  assert.match(r.html, /<table>/);
  assert.match(r.html, /<th>a<\/th>/);
});

await check('嵌套列表', async () => {
  const r = await renderMarkdown('- a\n  - b\n', opts());
  assert.match(r.html, /<ul>[\s\S]*<ul>/);
});

await check('任务列表', async () => {
  const r = await renderMarkdown('- [x] 完成\n- [ ] 未完成', opts());
  assert.match(r.html, /task-list-item/);
  assert.match(r.html, /checked/);
});

console.log('\n[5] 扩展语法');

await check('KaTeX 行内公式', async () => {
  const r = await renderMarkdown('行内 $E=mc^2$ 结束', opts());
  assert.match(r.html, /class="katex"/);
  assert.equal(r.hasMath, true);
});

await check('Mermaid 块保留为容器', async () => {
  const r = await renderMarkdown('```mermaid\ngraph TD; A-->B;\n```', opts());
  assert.match(r.html, /<div class="mermaid">/);
  assert.equal(r.hasMermaid, true);
});

await check('关闭 Mermaid 后按代码块输出', async () => {
  const r = await renderMarkdown('```mermaid\ngraph TD; A-->B;\n```', opts({ mermaid: false }));
  assert.match(r.html, /<pre class="code-block"/);
  assert.equal(r.hasMermaid, false);
});

console.log('\n[6] 标题与目录');

await check('提取标题并生成 id', async () => {
  const r = await renderMarkdown('# 一级\n\n## 二级\n', opts());
  assert.equal(r.headings.length, 2);
  assert.equal(r.headings[0].level, 1);
  assert.ok(r.headings[0].id.length > 0, 'id 不应为空');
});

await check('目录包含一级和二级标题', async () => {
  const r = await renderMarkdown('# 第一章\n\n## 1.1 节\n', opts({ toc: true }));
  assert.match(r.html, /class="toc"/);
  assert.match(r.html, /第一章/);
  assert.match(r.html, /1\.1 节/);
});

await check('标题里的 Markdown 标记不进入目录', async () => {
  const r = await renderMarkdown('## 带 `代码` 和 **粗体** 的标题\n', opts({ toc: true }));
  assert.ok(!/<a href="#[^"]*">[^<]*\*\*/.test(r.html), '目录里不应出现 ** 原始标记');
});

await check('标题优先级：front matter > 首个 h1', async () => {
  const r = await renderMarkdown('---\ntitle: 元数据标题\n---\n\n# 正文标题\n', opts());
  assert.equal(r.title, '元数据标题');
});

console.log('\n[7] 配置与版式');

await check('页边距预设与数字', () => {
  assert.deepEqual(resolveMargin('narrow'), { top: 12, right: 12, bottom: 15, left: 12 });
  assert.deepEqual(resolveMargin(20), { top: 20, right: 20, bottom: 20, left: 20 });
  assert.equal(resolveMargin('book').left, 25);
});

await check('纸张尺寸与横向', () => {
  assert.equal(resolvePaper('A4').w, 210);
  const o = normalizeOptions({ paper: 'A4', landscape: true });
  const d = pageDimensions(o);
  assert.equal(d.width, 297);
  assert.equal(d.height, 210);
});

await check('非法主题回落到 print', () => {
  assert.equal(normalizeOptions({ theme: 'nonsense' }).theme, 'print');
});

await check('表格线模式默认网格，非法值回落', () => {
  assert.equal(normalizeOptions({}).tableLines, 'grid');
  assert.equal(normalizeOptions({ tableLines: 'rules' }).tableLines, 'rules');
  assert.equal(normalizeOptions({ tableLines: '乱写' }).tableLines, 'grid');
});

await check('网格模式注入竖线规则', async () => {
  const o = normalizeOptions({ tableLines: 'grid', theme: 'print' });
  const body = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', opts());
  const html = await buildHtml({ bodyHtml: body.html, options: o, hasMath: false, hasMermaid: false });
  assert.match(html, /data-table-lines="grid"/);
  assert.match(html, /border:1px solid var\(--table-line/);
});

await check('横线模式不注入网格规则', async () => {
  const o = normalizeOptions({ tableLines: 'rules', theme: 'print' });
  const body = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |', opts());
  const html = await buildHtml({ bodyHtml: body.html, options: o, hasMath: false, hasMermaid: false });
  assert.match(html, /data-table-lines="rules"/);
  assert.ok(!/border:1px solid var\(--table-line/.test(html));
});

await check('页脚模板含页码占位符', () => {
  const t = buildFooterTemplate({ text: '页脚', showPageNumbers: true, margin: { left: 18, right: 18 } });
  assert.match(t, /class="pageNumber"/);
  assert.match(t, /class="totalPages"/);
});

console.log('\n[8] 完整 HTML 组装');

await check('生成完整 HTML 文档', async () => {
  const optsAll = normalizeOptions({ theme: 'print', toc: true });
  const body = await renderMarkdown('# 标题\n\n内容 $x^2$\n', opts({ toc: true }));
  const html = await buildHtml({
    bodyHtml: body.html,
    options: optsAll,
    title: body.title,
    author: null,
    hasMermaid: body.hasMermaid,
    hasMath: body.hasMath,
  });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /--font-size:10.5pt/);
  assert.ok(html.length > 5000, 'HTML 应内联了主题与公式样式');
});

await check('KaTeX 字体已转成 data URI（离线可用）', async () => {
  const optsAll = normalizeOptions({});
  const body = await renderMarkdown('$x^2$', opts());
  const html = await buildHtml({ bodyHtml: body.html, options: optsAll, hasMath: true });
  assert.match(html, /data:font\/woff2;base64,/);
  assert.ok(!/url\(fonts\//.test(html), '不应残留相对字体路径');
});

console.log('\n[9] 图片路径');

await check('相对图片路径转绝对 file://', async () => {
  const r = await renderMarkdown('![图](pic.png)', { baseDir: 'D:\\docs' });
  assert.match(r.html, /src="file:\/\/\/D:\/docs\/pic\.png"/i);
});

await check('网络图片原样保留', async () => {
  const r = await renderMarkdown('![图](https://example.com/a.png)', opts());
  assert.match(r.html, /src="https:\/\/example\.com\/a\.png"/);
});

console.log('\n[10] 边界');

await check('空文件不报错', async () => {
  const r = await renderMarkdown('', opts());
  assert.equal(typeof r.html, 'string');
});

await check('纯文本无标题时不崩', async () => {
  const r = await renderMarkdown('只是一段普通文字。', opts());
  assert.match(r.html, /<p>/);
  assert.equal(r.title, null);
});

await check('HTML 特殊字符被正确转义', async () => {
  const r = await renderMarkdown('```\n<script>alert(1)</script>\n```', opts());
  assert.ok(!r.html.includes('<script>alert(1)</script>'));
  assert.match(r.html, /&lt;script&gt;/);
});

await check('超长单词不会导致渲染失败', async () => {
  const long = 'a'.repeat(600);
  const r = await renderMarkdown(`| 列 |\n|---|\n| ${long} |`, opts());
  assert.match(r.html, /<table>/);
});

// ---------- 可选的端到端 ----------
if (process.argv.includes('--e2e')) {
  console.log('\n[11] 端到端 PDF');
  const { convertFile } = await import('../src/pipeline.mjs');
  const tmp = path.join(os.tmpdir(), 'md2pdf-smoke');
  fs.mkdirSync(tmp, { recursive: true });
  const src = path.join(tmp, 'smoke.md');
  fs.writeFileSync(
    src,
    '# 冒烟测试\n\n**加粗** *斜体* <u>下划线</u>\n\n```js\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
    'utf8',
  );
  const out = path.join(tmp, 'smoke.pdf');
  await check('生成 PDF 文件', async () => {
    const r = await convertFile(src, out, { theme: 'print' });
    assert.ok(fs.existsSync(out), 'PDF 应存在');
    const size = fs.statSync(out).size;
    assert.ok(size > 10000, `PDF 太小：${size} 字节`);
    assert.ok(size.toString(10).length > 0);
    assert.equal(r.output, out);
  });
}

console.log(`\n${'-'.repeat(48)}`);
console.log(`通过 ${passed}，失败 ${failed}`);
if (failed) {
  console.log('\n失败项：');
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
console.log('全部通过 ✔\n');
