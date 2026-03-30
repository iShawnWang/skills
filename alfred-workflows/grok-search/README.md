# Grok 快速搜索 Alfred 工作流

这个工作流允许你通过 Alfred 快速打开 `grok.com` 并直接带入你的查询内容。

## 如何在 Alfred 中配置

1. 打开 Alfred 偏好设置 (Preferences) -> Workflows。
2. 点击底部的 `+` -> Blank Workflow。
3. 设置名称为 `Grok Search`。
4. 在画布上右键 -> Inputs -> Keyword。
    - Keyword: `grok` (或者你喜欢的任何词)
    - Argument: `Required`
5. 在画布上右键 -> Actions -> Run Script。
    - Language: `/bin/bash`
    - Script 内容:
      ```bash
      /Users/qckj/skills/alfred-workflows/grok-search/open_grok.sh "$1"
      ```
6. 将 Keyword 连接到 Run Script。

## 使用方法

在 Alfred 中输入:
`grok 你的问题`

它将自动打开浏览器并跳转到 `https://grok.com/?q=你的问题`。

## 依赖说明

- **macOS 系统**: 脚本基于 macOS 自带的 `zsh` 和 `xxd` 实现。
- **无需额外安装**: **不需要**安装 Python、Node.js 或任何第三方库。这意味着你把这个脚本分享给其他 Mac 用户时，他们可以直接运行，无需配置任何环境。
