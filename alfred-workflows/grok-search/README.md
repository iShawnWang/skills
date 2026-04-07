# AI 快速搜索 Alfred 工作流

> 极速在浏览器中打开 Grok / Claude 并自动带入搜索词，零外部依赖，支持中文。
>
> Blazing fast Alfred workflow to search on Grok.com or Claude.ai with zero dependencies and full UTF-8 support.

## 脚本说明

`open_grok.sh <target> <query>`

| 参数     | 说明                        |
|----------|-----------------------------|
| `target` | `grok`（默认）或 `claude`   |
| `query`  | 搜索词，可含空格/中文       |

## 如何在 Alfred 中配置（单 Workflow）

> **一个 Workflow，两个 Keyword，两个 Run Script，共用同一个 `.sh` 文件。**

1. 打开 Alfred 偏好设置 -> Workflows。
2. 点击 `+` -> Blank Workflow，命名为 `AI Search`。
3. 在画布上**右键 -> Inputs -> Keyword**，添加第一个关键词：
   - Keyword: `grok`
   - Argument: `Optional`
   - Title: `Search on Grok`
4. 在画布上**再次右键 -> Inputs -> Keyword**，添加第二个关键词：
   - Keyword: `claude`
   - Argument: `Optional`
   - Title: `Search on Claude`
5. 添加第一个 **Actions -> Run Script**（对应 Grok）：
   - Language: `/bin/zsh`
   - Script:
     ```bash
     /Users/qckj/skills/alfred-workflows/grok-search/open_grok.sh grok "$1"
     ```
6. 添加第二个 **Actions -> Run Script**（对应 Claude）：
   - Language: `/bin/zsh`
   - Script:
     ```bash
     /Users/qckj/skills/alfred-workflows/grok-search/open_grok.sh claude "$1"
     ```
7. 连线：
   - `grok` Keyword → 第一个 Run Script（grok）
   - `claude` Keyword → 第二个 Run Script（claude）

画布最终结构：

```
[Keyword: grok]   →  [Run Script: open_grok.sh grok "$1"]
[Keyword: claude] →  [Run Script: open_grok.sh claude "$1"]
```

## 使用方法

| 输入              | 效果                                      |
|-------------------|-------------------------------------------|
| `grok 你的问题`   | 打开 `https://grok.com/?q=你的问题`       |
| `grok`            | 直接打开 `https://grok.com/`              |
| `claude 你的问题` | 打开 `https://claude.ai/new?q=你的问题`   |
| `claude`          | 直接打开 `https://claude.ai/new`          |

## 依赖说明

- **macOS 系统**: 脚本基于 macOS 自带的 `zsh`、`xxd` 和 `osascript` 实现。
- **无需额外安装**: 不需要 Python、Node.js 或任何第三方库，直接分享给其他 Mac 用户即可运行。
