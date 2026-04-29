---
name: "gitlab-skill"
description: "GitLab 集成插件，支持查询用户信息、搜索仓库、创建分支、提交代码及合并分支。在需要执行 GitLab 相关操作时调用。"
---

# GitLab Skill

此 Skill 提供与 GitLab 实例交互的能力。

## 执行须知
- **工作目录**: 所有指令必须在 `gitlab-skills/` 目录下执行，或使用绝对路径 `npx tsx /path/to/gitlab-skills/src/index.ts`。
- **输出格式**: 所有命令 stdout 输出 JSON，stderr 输出过程日志（不影响结果解析）。
- **环境要求**: Node.js >= 18，无需预装依赖，`npx` 会自动下载 tsx。
- **配置路径**: 固定读取当前 Skill 安装目录下的 `.env`，兼容旧版 `.env.gitlab`。

## 初始化配置 (首次使用必读)
为了让 Skill 正常运行并持久化你的凭据，**首次使用时**必须执行初始化操作：
- **操作方式**: 告诉 AI 你的 `accessToken` 和 `gitlabEndpoint`，AI 会自动调用初始化指令。
- **存储方式**: 配置会被安全存储在当前 Skill 安装目录的 `.env` 文件中（权限 600）。
- **兼容说明**: 如果目录里只有旧版 `.env.gitlab`，Skill 仍会继续读取。
- **重新配置**: 如果需要更换账号或实例地址，再次执行初始化指令即可覆盖。

## 核心功能

### 0. 初始化 (Init)
设置并保存访问凭据。
- **调用场景**: 首次使用、报错提示未配置、或用户要求更新配置时。
- **指令**: `npx tsx src/index.ts init <token> <endpoint>`

### 1. 查询用户信息
获取当前登录用户或特定用户的详细信息。
- **调用场景**: 需要确认用户权限或获取 User ID 时。
- **指令**: `npx tsx src/index.ts user [username]`

### 2. 查询仓库 (Repos)
搜索或列出用户有权访问的项目。
- **调用场景**: 需要寻找特定项目 ID 或查看项目列表时。
- **指令**: `npx tsx src/index.ts repos [search]`

### 3. 创建分支 (Create Branch)
基于某个已有分支创建新分支。
- **参数支持**:
    - **仓库**: 支持传入 `Project ID` 或 `仓库名称` (模糊匹配)。
    - **基准分支**: 支持传入 `完整分支名` 或 `模糊分支名` (自动寻找最匹配的分支)。
- **调用场景**: 开始新需求、修复问题、发布准备，或用户要求“基于某个分支创建新分支”时。
- **指令**: `npx tsx src/index.ts branch "my-repo" "feature/new-task" "main"`

### 4. 提交代码并 push (Commit)
在指定远程分支创建一次提交。该命令使用 GitLab Commits API 直接提交到远程分支，相当于完成 push。
- **参数支持**:
    - **仓库**: 支持传入 `Project ID` 或 `仓库名称` (模糊匹配)。
    - **目标分支**: 支持传入 `完整分支名` 或 `模糊分支名` (自动寻找最匹配的分支)。
    - **actions**: 支持 JSON 字符串，或 `@actions.json` 文件路径。actions 必须是数组。
- **actions 格式**:
```json
[
  {
    "action": "update",
    "file_path": "README.md",
    "content": "新的文件内容"
  }
]
```
- **支持的 action**: `create`、`update`、`delete`、`move`、`chmod`。
- **调用场景**: 用户要求“在某个分支提交代码并 push”、需要远程创建/更新/删除文件时。
- **指令**: `npx tsx src/index.ts commit "my-repo" "feature/new-task" "docs: update readme" @actions.json`

### 5. 合并分支 (Merge Branches)
将一个分支的代码合并到另一个分支（通过创建并自动合并 Merge Request 实现）。
- **参数支持**:
    - **仓库**: 支持传入 `Project ID` 或 `仓库名称` (模糊匹配)。
    - **分支**: 支持传入 `完整分支名` 或 `模糊分支名` (自动寻找最匹配的分支)。
- **行为说明**: 创建 MR 后等待 5s 再执行合并（GitLab 需要时间初始化 MR），期间 stderr 会输出进度，属于正常现象，请耐心等待。
- **调用场景**: 自动化部署、同步分支代码或完成开发任务时。
- **指令**: `npx tsx src/index.ts merge "my-repo" "feature-1" "main"`

## 输出格式
所有命令均输出 JSON 格式，方便 AI 解析。过程日志输出到 stderr，结果数据输出到 stdout。

## 使用示例
> "帮我查询一下用户 'john_doe' 的信息"
> "搜索名为 'frontend-app' 的仓库"
> "基于 'main' 创建新分支 'feature-abc'，项目 ID 是 123"
> "在 'feature-abc' 分支提交 README 变更并 push，项目 ID 是 123"
> "将 'feature-abc' 分支合并到 'main' 分支，项目 ID 是 123"
