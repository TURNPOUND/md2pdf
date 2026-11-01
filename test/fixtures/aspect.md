---
title: 行内代码与表格专项测试
---

# 一、行内代码

单个：`code` ｜ 带空格：`git commit -m "fix"` ｜ 带尖括号：`<div class="x">`

命令行：`npm run build -- --watch` ｜ 路径：`C:\Users\test\a.md`

中英混排：调用 `render()` 方法后返回 `Promise<Buffer>` 类型。

长代码（跨行）：

这是一段比较长的正文，用来测试行内代码在换行时的表现，`const result = await someVeryLongFunctionName(argumentOne, argumentTwo, argumentThree)` 看看跨行后底色是否连续。

连续多个：`a` `b` `c` 和 `--flag` 与 `-v`。

# 二、表格

| 命令 | 作用 | 备注 |
| --- | --- | --- |
| `npm install` | 安装依赖 | 首次运行 |
| `npm run build` | 构建 | 输出到 `dist/` |
| `--watch` | 监听模式 | 开发用 |
| `-h`, `--help` | 查看帮助 | 简写与全称 |

三列表格：

| 左 | 中 | 右 |
| :-- | :-: | --: |
| 左对齐 | 居中 | 右对齐 |
| 1 | 2 | 3 |

# 三、结论

表格竖线与行内代码应清晰可辨。
