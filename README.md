# Markdown → PDF（打印版）

把 `.md` 文件转成**适合打印**的 PDF：中文排版、页码、目录、代码高亮、公式、图表全部保留。

不下载浏览器，直接复用系统里已装好的 Edge / Chrome；不联网，字体和依赖全部在本地。

---

## 快速开始

### 1. 双击（最省事）

```
bin\MD转PDF-拖拽我.cmd
```

- **双击**：打开图形界面，把 `.md` 拖进去或直接粘贴
- **把 .md 文件拖到这个 .cmd 上**：直接生成同名 PDF 并打开

### 2. 命令行

```bat
:: 单个文件
node src/cli.mjs 报告.md

:: 指定输出
node src/cli.mjs 报告.md -o D:\输出\报告.pdf

:: 整个目录（递归）
node src/cli.mjs docs\ -o D:\输出

:: 打印友好的一套参数
node src/cli.mjs 报告.md --theme print --toc --margin book --open
```

### 3. 图形界面

```bat
node src/server.mjs --open
```

浏览器打开 `http://127.0.0.1:7361`，拖文件、调参数、预览、下载。

---

## 命令行参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `-o, --output <路径>` | 输出文件或目录 | 同名 `.pdf` |
| `--theme <name>` | `print` 黑白省墨 / `default` 彩色印刷 | `print` |
| `--paper <size>` | `A4` `A5` `B5` `B4` `Letter` `Legal` | `A4` |
| `--landscape` | 横向 | 纵向 |
| `--margin <值>` | `normal` `narrow` `wide` `book`（左宽装订边）或数字(mm) | `normal` |
| `--font-size <pt>` | 正文字号 | `10.5` |
| `--line-height <倍数>` | 行高 | `1.7` |
| `--indent <em>` | 首行缩进，`2` = 中文公文风格 | `0` |
| `--justify` | 两端对齐 | 左对齐 |
| `--table-lines <mode>` | `grid` 完整网格（含竖线）/ `rules` 只有横线 | `grid` |
| `--toc` | 生成目录（单独一页） | 关 |
| `--page-break-h1` | 每个一级标题另起一页 | 关 |
| `--no-page-numbers` | 不打印页码 | 打印 |
| `--header <文字>` | 页眉（默认用文档标题） | 自动 |
| `--footer <文字>` | 页脚左侧文字 | 空 |
| `--title <文字>` | 强制指定文档标题 | 自动 |
| `--no-mermaid` | 关闭 Mermaid 渲染 | 开 |
| `--no-highlight` | 关闭代码高亮 | 开 |
| `--open` | 完成后打开 PDF | 关 |
| `--keep-html` | 保留中间 HTML（查样式用） | 关 |

---

## 两套主题

**`print`（默认，黑白激光打印机）**
- 纯灰度，无大面积色块填充，省墨不糊纸
- 代码块白底 + 细边框，不是灰底
- 行内代码用浅灰底 + 等宽字体，与正文区分
- 表格默认完整网格（外框加粗 + 内部竖线横线），可用 `--table-lines rules` 换成只有横线的学术风格
- 链接靠下划线区分，不靠颜色
- 正文默认宋体族，标题黑体

**`default`（彩色打印 / 电子分发）**
- 蓝色强调色，浅色代码底，表头浅底
- 表格同为完整网格，线色更浅
- 适合彩印、平板阅读、发邮件

---

## 打印建议

| 场景 | 建议参数 |
| --- | --- |
| 普通 A4 双面打印 | `--theme print --margin book`（左侧留装订边） |
| 正式报告 / 公文 | `--theme print --toc --indent 2 --font-size 11` |
| 阅读版（字号大一点） | `--font-size 12 --line-height 1.8` |
| 小册子 / A5 | `--paper A5 --margin narrow --font-size 9.5` |
| 表格多、内容密 | `--margin narrow --font-size 9.5` |
| 表格想要只有横线的学术风格 | `--table-lines rules` |

打印时在打印对话框里选 **「实际大小 / 100%」**，不要选「适合页面」，否则页边距会被二次缩放。

---

## 支持的内容

- 标题、加粗、斜体、删除线、行内代码、链接、图片
- **下划线**：Markdown 标准里没有，用 `<u>下划线</u>` 内联 HTML 写
- 有序 / 无序 / 嵌套列表、任务列表 `- [x]`
- 表格（长单词和长 URL 自动断行，不撑破页宽）
- 代码块 + 语法高亮（highlight.js，40+ 常用语言）
- 数学公式（KaTeX，行内 `$x$` 和块级 `$$x$$`）
- Mermaid 流程图 / 时序图 / 甘特图
- 引用块、分隔线、脚注
- YAML front matter（`title` / `author` 会自动用作标题和作者）

---

## 常见问题

**Q：提示找不到浏览器？**
装 Microsoft Edge 或 Google Chrome 即可。也可以指定路径：
```bat
set MD2PDF_BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe
```

**Q：第一行的 `# 标题` 没生效？**
文件带了 UTF-8 BOM。本工具已经在读入时自动剥离 BOM，如果仍有问题，用记事本「另存为 → UTF-8（无 BOM）」。

**Q：字体和我本机不一样？**
PDF 会嵌入实际渲染字体。目标机器上没有的字体，本机渲染时就已经按回退链替换过了，所以 PDF 在哪台机器上打开都一致。想指定字体，改 `src/themes/*.css` 里的 `--body-font`。

**Q：图片显示不出来？**
Markdown 里的相对路径图片是相对 **.md 文件所在目录** 解析的。网络图片需要联网才能打印。

**Q：Mermaid 图没出来？**
图表渲染超时（默认 8 秒兜底）。检查 mermaid 语法，或者加 `--no-mermaid` 让它以代码块形式打印。

**Q：PDF 里没有书签/左侧目录树？**
当前版本生成的是正文目录页（`--toc`），不写 PDF 大纲书签。需要书签可以后续加。

**Q：能转 epub/docx 吗？**
不能，本工具只做 Markdown → PDF。

---

## 目录结构

```
md2pdf/
├── bin/
│   └── MD转PDF-拖拽我.cmd     双击 / 拖拽启动
├── src/
│   ├── cli.mjs                 命令行入口
│   ├── server.mjs              本地图形界面服务
│   ├── pipeline.mjs            转换流程编排
│   ├── core.mjs                Markdown → HTML
│   ├── template.mjs            HTML 骨架、KaTeX 字体内联
│   ├── renderer.mjs            HTML → PDF（puppeteer-core）
│   ├── browser.mjs             定位系统 Edge/Chrome
│   ├── config.mjs              参数与纸张定义
│   └── themes/
│       ├── print.css           黑白省墨主题
│       └── default.css         彩色主题
├── public/index.html           图形界面
├── assets/mermaid.min.js       Mermaid 运行时（静态文件，5MB）
└── test/                       冒烟测试与样例
```

---

## 分发 / 迁移到别的电脑

整个 `md2pdf` 文件夹复制走就行，不需要重新安装依赖（`node_modules` 已包含在内，约 44MB）。

目标机器需要：
1. Node.js 18 以上（`node -v` 能看到版本）
2. Microsoft Edge 或 Google Chrome

---

## 开发

```bat
npm test          :: 冒烟测试（加 --e2e 会真的生成一次 PDF）
npm run gui       :: 图形界面
npm start -- 文件.md
```

> **改完 `src/` 下的代码，必须重启图形界面服务才会生效。**
> Node 的 ES 模块在进程启动时就加载完毕，不会热重载。界面左下角会显示「服务启动于 …」，
> 如果刚改过样式却发现没变化，先看这个时间对不对，再看是不是重启过。

命令行方式每次都是新进程，不受影响。
