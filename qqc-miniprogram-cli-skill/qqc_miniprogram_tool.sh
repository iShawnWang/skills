#!/bin/zsh

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SKILL_DIR/.env"

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[A-Z_]+=.+ ]]; then
        export "$line"
      fi
    done < "$ENV_FILE"
  fi
}

save_env() {
  cat <<EOF > "$ENV_FILE"
IMAC_IP=$1
IMAC_PORT=$2
EOF
  chmod 600 "$ENV_FILE"
}

require_env() {
  if [[ -z "$IMAC_IP" || -z "$IMAC_PORT" ]]; then
    echo "错误: 未找到配置，请先执行 '$0 init <iMac_IP> [iMac_Port]'"
    exit 1
  fi
}

request() {
  local method=$1
  local path=$2
  require_env
  curl -s -X "$method" "http://$IMAC_IP:$IMAC_PORT$path"
}

load_env

case "$1" in
  init)
    if [[ -z "$2" ]]; then
      echo "用法: $0 init <iMac_IP> [iMac_Port]"
      exit 1
    fi
    save_env "$2" "${3:-3000}"
    echo "配置已保存至: $ENV_FILE"
    ;;
  show)
    require_env
    echo "IMAC_IP=$IMAC_IP"
    echo "IMAC_PORT=$IMAC_PORT"
    ;;
  health)
    request GET "/health"
    ;;
  status)
    request GET "/status"
    ;;
  log)
    request GET "/log"
    ;;
  last-build)
    request GET "/last-build"
    ;;
  build)
    request POST "/build"
    ;;
  *)
    echo "用法: $0 {init|show|health|status|log|last-build|build} [参数]"
    exit 1
    ;;
esac
