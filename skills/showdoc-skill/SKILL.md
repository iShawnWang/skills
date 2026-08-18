---
name: showdoc-skill
description: 从 ShowDoc 文档系统获取页面内容。此技能在以下情况触发：1) URL 包含 `/web/#/` 模式且末尾为数字（如 `http://wiki.yeqiao.cn:4999/web/#/625324075/123670000`）；2) 用户请求获取 ShowDoc 文档内容；3) 用户发送类似 `wiki.yeqiao.cn` 或 `172.17.188.123` 等 ShowDoc 域名链接。
---

# ShowDoc 文档获取

此技能用于从 ShowDoc 文档系统获取页面内容并转换为 Markdown 格式。

## 使用场景

当用户提供 ShowDoc 文档链接（如 `http://wiki.yeqiao.cn:4999/web/#/625324075/123670000`）并请求获取其内容时，使用此技能。

## 工作流程

### 1. 解析 ShowDoc URL

从 ShowDoc URL 中提取 API 端点和页面 ID：

- URL 格式: `http://domain:port/web/#/cat_id/page_id`
- API 端点: `http://domain:port/server/index.php?s=/api/page/info`
- 页面 ID: URL 末尾的数字

### 2. 调用 ShowDoc API

使用 `scripts/fetch_page.mjs` 脚本获取文档：

```bash
node scripts/fetch_page.mjs <showdoc_url>
```

### 3. 返回 Markdown 内容

脚本会返回转换后的 Markdown 格式文档内容。

## 常用 ShowDoc API

| 操作 | API 端点 | 参数 |
|------|----------|------|
| 获取页面信息 | `/api/page/info` | `page_id` |
| 页面列表 | `/api/page/list` | `cat_id`, `page_size`, `page` |
| 搜索页面 | `/api/page/search` | `keyword` |
