# AI 快速搜索 Alfred 工作流

> 极速在浏览器中打开 Grok / Claude / Gemini 并自动带入搜索词，零外部依赖，支持中文。
>
> Blazing fast Alfred workflow to search on Grok.com, Claude.ai, or Gemini with zero dependencies and full UTF-8 support.

## 脚本说明

`aisearch.sh <target> <query>`

| 参数     | 说明                               |
|----------|------------------------------------|
| `target` | `grok`（默认）`claude` 或 `gemini` |
| `query`  | 搜索词，可含空格/中文              |

## 如何在 Alfred 中配置（单 Workflow）

> **一个 Workflow，多个 Keyword，多个 Run Script，共用同一个 `.sh` 文件。**

1. 打开 Alfred 偏好设置 -> Workflows。
2. 点击 `+` -> Blank Workflow，命名为 `AI Search`。
3. 在画布上**右键 -> Inputs -> Keyword**，添加各大平台的关键词，比如：
   - Keyword: `grok` (或 `claude` / `gemini`)
   - Argument: `Optional`
   - Title: `Search on Grok`
4. 为每个 Keyword 添加对应的 **Actions -> Run Script**：
   - Language: `/bin/zsh`
   - Script (例如 Grok):
     ```bash
     /Users/qckj/skills/alfred-workflows/grok-search/aisearch.sh grok "$1"
     ```
   - Script (例如 Claude):
     ```bash
     /Users/qckj/skills/alfred-workflows/grok-search/aisearch.sh claude "$1"
     ```
   - Script (例如 Gemini):
     ```bash
     /Users/qckj/skills/alfred-workflows/grok-search/aisearch.sh gemini "$1"
     ```
5. 将相应的 Keyword 连接到对应的 Run Script。

画布最终结构示例：

```
[Keyword: grok]   →  [Run Script: aisearch.sh grok "$1"]
[Keyword: claude] →  [Run Script: aisearch.sh claude "$1"]
[Keyword: gemini] →  [Run Script: aisearch.sh gemini "$1"]
```

## 使用方法

| 输入              | 效果                                              |
|-------------------|---------------------------------------------------|
| `grok 你的问题`   | 打开 `https://grok.com/?q=你的问题`               |
| `grok`            | 直接打开 `https://grok.com/`                      |
| `claude 你的问题` | 打开 `https://claude.ai/new?q=你的问题`           |
| `claude`          | 直接打开 `https://claude.ai/new`                  |
| `gemini 你的问题` | 打开 `https://gemini.google.com/app?prompt=你的问题`  |
| `gemini`          | 直接打开 `https://gemini.google.com/app`          |

## 依赖说明

- **macOS 系统**: 脚本基于 macOS 自带的 `zsh`、`xxd` 和 `osascript` 实现。
- **无需额外安装**: 不需要 Python、Node.js 或任何第三方库，直接分享给其他 Mac 用户即可运行。
