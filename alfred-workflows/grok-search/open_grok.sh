#!/bin/zsh

# 获取用户输入
query="$*"

# 如果没有输入，只打开 grok.com 首页
if [[ -z "$query" ]]; then
  open "https://grok.com/"
  exit 0
fi

# 使用 macOS 自带的 xxd 进行 URL 编码 (零外部依赖，完美支持中文)
# 这比 python3 更轻量，不需要用户安装任何环境
encoded_query=$(echo -n "$query" | xxd -p | sed "s/../%&/g" | tr "[:lower:]" "[:upper:]")

# 打开 grok.com 并带上查询参数
open "https://grok.com/?q=${encoded_query}"

# Claude
# open "https://claude.ai/new?q=${encoded_query}"
