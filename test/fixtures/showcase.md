---
title: 格式支持总览
author: 大肥鱼 · Markdown 转 PDF 工具
---

# 一、行内格式

从**加粗**、*斜体*、***粗斜体***、<u>下划线</u>、~~删除线~~，到 `行内代码` 和[外部链接](https://example.com)，
再到中文标点——引号"测试"、破折号——、省略号……，全部保留原样。

> 引用块：打印时只留一条细左边框，黑白激光机不会糊成一片。

# 二、代码块

```typescript
interface Document {
  title: string;
  pages: number;
}

export async function convert(doc: Document): Promise<Buffer> {
  const html = await render(doc);      // Markdown -> HTML
  return await print(html, { paper: 'A4', margin: 'book' });
}
```

# 三、表格

| 能力 | 支持 | 说明 |
| --- | --- | --- |
| 加粗 / 斜体 | 是 | 真字体，非描边 |
| 下划线 | 是 | `<u>` 内联 HTML |
| 代码高亮 | 是 | 黑白打印自动转灰阶 |
| 数学公式 | 是 | KaTeX，离线内嵌字体 |
| Mermaid | 是 | 渲染成矢量图 |
| 超长 URL 断行 | 是 | https://example.com/very/long/path/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |

# 四、列表

1. 有序列表第一项
2. 第二项
   - 嵌套无序项
   - 另一个嵌套项
3. 第三项

- [x] 已完成的任务
- [ ] 待办的任务

# 五、公式

行内 $E = mc^2$，块级：

$$
\int_{0}^{\infty} \frac{x^{3}}{e^{x}-1}\,dx = \frac{\pi^{4}}{15}
$$

# 六、图表

```mermaid
graph LR
  A[Markdown] --> B[HTML]
  B --> C[PDF]
  C --> D{打印}
```

# 七、脚注

这里有一个脚注引用[^1]。

[^1]: 脚注内容会排在这一页或文末，样式与正文区分。
