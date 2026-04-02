#!/bin/zsh

# 获取用户输入
query="$*"

# 如果没有输入，只打开 grok.com 首页
if [[ -z "$query" ]]; then
  open "https://grok.com/"
  exit 0
fi

# 使用 macOS 自带的 xxd 进行 URL 编码 (零外部依赖，完美支持中文)
# tr -d '\n' 确保输出为单行，防止长输入时 xxd 插入换行符导致二次编码
encoded_query=$(echo -n "$query" | xxd -p | tr -d '\n' | sed "s/../%&/g" | tr "[:lower:]" "[:upper:]")

# 使用 osascript 打开 URL，避免 macOS 'open' 命令对已编码的 '%' 进行二次编码
osascript -e "open location \"https://grok.com/?q=${encoded_query}\""

# Claude
# open "https://claude.ai/new?q=${encoded_query}"
