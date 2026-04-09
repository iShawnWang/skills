#!/bin/zsh

# usage: aisearch.sh <target> <query...>
#   target: grok | claude | gemini
#   query : query auto urlencode

target="$1"
shift
query="$*"

# URL encode
encode_query() {
  echo -n "$1" | xxd -p | tr -d '\n' | sed 's/../%&/g' | tr '[:lower:]' '[:upper:]'
}

open_url() {
  osascript -e "open location \"$1\""
}

case "$target" in
  claude)
    if [[ -z "$query" ]]; then
      open_url "https://claude.ai/new"
    else
      encoded=$(encode_query "$query")
      open_url "https://claude.ai/new?q=${encoded}"
    fi
    ;;
  gemini)
    if [[ -z "$query" ]]; then
      open_url "https://aistudio.google.com/app/prompts/new_chat"
    else
      encoded=$(encode_query "$query")
      open_url "https://aistudio.google.com/app/prompts/new_chat?prompt=${encoded}"
    fi
    ;;
  grok|*)
    if [[ -z "$query" ]]; then
      open_url "https://grok.com/"
    else
      encoded=$(encode_query "$query")
      open_url "https://grok.com/?q=${encoded}"
    fi
    ;;
esac
