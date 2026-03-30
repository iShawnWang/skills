#!/bin/zsh

# 尝试从 .env.gitlab 加载环境变量 (持久化存储)
ENV_FILE="$(dirname "$0")/.env.gitlab"
if [[ -f "$ENV_FILE" ]]; then
  # 使用内置的 export 命令加载，避免使用 source 以减少安全风险
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^[A-Z_]+=.+ ]]; then
      export "$line"
    fi
  done < "$ENV_FILE"
fi

# 1. 初始化功能：设置并保存配置
# usage: gitlab_tool.sh init <token> <endpoint>
init_config() {
  local token=$1
  local endpoint=$2

  if [[ -z "$token" || -z "$endpoint" ]]; then
    echo "用法: gitlab_tool.sh init <accessToken> <gitlabEndpoint>"
    return 1
  fi

  cat <<EOF > "$ENV_FILE"
GITLAB_ACCESS_TOKEN=$token
GITLAB_ENDPOINT=$endpoint
EOF

  chmod 600 "$ENV_FILE"
  echo "配置已初始化并安全保存至: $ENV_FILE"
}

# 检查环境变量
check_env() {
  if [[ -z "$GITLAB_ACCESS_TOKEN" || -z "$GITLAB_ENDPOINT" ]]; then
    echo "错误: 请先执行 'gitlab_tool.sh init <token> <endpoint>' 进行初始化"
    exit 1
  fi
}

API_URL="${GITLAB_ENDPOINT%/}/api/v4"
AUTH_HEADER="PRIVATE-TOKEN: $GITLAB_ACCESS_TOKEN"

# 1. 查询用户信息
# usage: gitlab_tool.sh user [username]
get_user_info() {
  local username=$1
  if [[ -z "$username" ]]; then
    # 查询当前用户
    curl -s --header "$AUTH_HEADER" "$API_URL/user"
  else
    # 根据用户名搜索用户
    curl -s --header "$AUTH_HEADER" "$API_URL/users?username=$username"
  fi
}

# 2. 查询仓库 (Repos)
# usage: gitlab_tool.sh repos [search_term]
get_repos() {
  local search=$1
  if [[ -z "$search" ]]; then
    # 列出当前用户的所有项目
    curl -s --header "$AUTH_HEADER" "$API_URL/projects?membership=true&simple=true&per_page=100"
  else
    # 搜索项目
    curl -s --header "$AUTH_HEADER" "$API_URL/projects?search=$search&membership=true&simple=true"
  fi
}

# 辅助函数：通过仓库名查找项目 ID
find_project_id_by_name() {
  local name=$1
  local projects=$(curl -s --header "$AUTH_HEADER" "$API_URL/projects?search=$name&membership=true&simple=true")
  # 优先寻找完全匹配的项目名，否则返回第一个搜索结果的 ID
  echo "$projects" | python3 -c "import sys, json;
data=json.load(sys.stdin);
exact = [p['id'] for p in data if p['name'] == '$name' or p['path'] == '$name'];
print(exact[0] if exact else (data[0]['id'] if data else ''))"
}

# 辅助函数：通过模糊分支名查找准确的分支名
find_branch_fuzzy() {
  local project_id=$1
  local fuzzy_branch=$2
  local branches=$(curl -s --header "$AUTH_HEADER" "$API_URL/projects/$project_id/repository/branches?search=$fuzzy_branch")
  # 优先寻找完全匹配的分支，否则返回第一个搜索结果的 Name
  echo "$branches" | python3 -c "import sys, json;
data=json.load(sys.stdin);
exact = [b['name'] for b in data if b['name'] == '$fuzzy_branch'];
print(exact[0] if exact else (data[0]['name'] if data else ''))"
}

# 3. 合并分支 (支持仓库名、模糊分支名)
# usage: gitlab_tool.sh merge <project_id_or_name> <source_branch_fuzzy> <target_branch_fuzzy> [title]
merge_branches() {
  local input_project=$1
  local input_source=$2
  local input_target=$3
  local title="${4:-"Merge $input_source into $input_target via GitLab Skill"}"

  if [[ -z "$input_project" || -z "$input_source" || -z "$input_target" ]]; then
    echo "用法: merge <project_id_or_name> <source_branch_fuzzy> <target_branch_fuzzy> [title]"
    return 1
  fi

  # 1. 识别项目 ID
  local project_id=$input_project
  if [[ ! "$input_project" =~ ^[0-9]+$ ]]; then
    echo "正在查找仓库 '$input_project' 的 ID..."
    project_id=$(find_project_id_by_name "$input_project")
    if [[ -z "$project_id" ]]; then
      echo "错误: 找不到仓库 '$input_project'"
      return 1
    fi
    echo "找到仓库 ID: $project_id"
  fi

  # 2. 识别源分支名
  echo "正在查找源分支 '$input_source'..."
  local source_branch=$(find_branch_fuzzy "$project_id" "$input_source")
  if [[ -z "$source_branch" ]]; then
    echo "错误: 在项目 $project_id 中找不到源分支 '$input_source'"
    return 1
  fi
  echo "确定源分支: $source_branch"

  # 3. 识别目标分支名
  echo "正在查找目标分支 '$input_target'..."
  local target_branch=$(find_branch_fuzzy "$project_id" "$input_target")
  if [[ -z "$target_branch" ]]; then
    echo "错误: 在项目 $project_id 中找不到目标分支 '$input_target'"
    return 1
  fi
  echo "确定目标分支: $target_branch"

  # 4. 创建 Merge Request
  echo "正在创建 Merge Request: $source_branch -> $target_branch..."
  local mr_response=$(curl -s --request POST --header "$AUTH_HEADER" \
    --data "source_branch=$source_branch" \
    --data "target_branch=$target_branch" \
    --data "title=$title" \
    --data "remove_source_branch=false" \
    "$API_URL/projects/$project_id/merge_requests")

  # 提取 IID 和 Web URL
  local mr_info=$(echo "$mr_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"{data.get('iid', '')}|{data.get('web_url', '')}\")")
  local iid="${mr_info%%|*}"
  local web_url="${mr_info##*|}"

  if [[ -z "$iid" ]]; then
    echo "创建 Merge Request 失败: $mr_response"
    return 1
  fi

  echo "Merge Request 已创建 (IID: $iid)。正在尝试自动合并..."

  # 2. 接受 (合并) Merge Request
  local merge_response=$(curl -s --request PUT --header "$AUTH_HEADER" \
    "$API_URL/projects/$project_id/merge_requests/$iid/merge")

  local merge_data=$(echo "$merge_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"{data.get('state', '')}|{data.get('merge_error', '')}\")")
  local state="${merge_data%%|*}"
  local merge_error="${merge_data##*|}"

  if [[ "$state" == "merged" ]]; then
    echo "✅ 合并成功！"
    echo "MR 地址: $web_url"
  else
    echo "❌ 合并失败。"
    if [[ -n "$merge_error" ]]; then
      echo "错误原因: $merge_error"
    fi
    echo "存在冲突或需要手动干预，请前往处理:"
    echo "MR 地址: $web_url"
  fi
}

# 主逻辑
case "$1" in
  init)
    init_config "$2" "$3"
    ;;
  user)
    check_env
    get_user_info "$2"
    ;;
  repos)
    check_env
    get_repos "$2"
    ;;
  merge)
    check_env
    merge_branches "$2" "$3" "$4" "$5"
    ;;
  *)
    echo "用法: $0 {init|user|repos|merge} [参数]"
    exit 1
    ;;
esac
