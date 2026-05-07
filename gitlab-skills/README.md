# GitLab AI Skill

这是一个为 AI 设计的 GitLab 集成插件，支持查询用户、仓库、创建分支、提交代码以及自动化合并分支。

使用 TypeScript 编写，零运行时依赖，通过 `npx tsx` 直接执行。

## 文件结构

```
gitlab-skills/
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── .env                   # 用户配置（自动生成，已 gitignore）
├── .env.gitlab.example    # 旧版配置模板（兼容保留）
├── SKILL.md               # AI Skill 定义
├── README.md              # 使用文档
└── src/
    ├── index.ts           # 入口 + 命令路由
    ├── config.ts          # 配置管理
    ├── client.ts          # GitLab API 客户端
    ├── types.ts           # 类型定义
    └── commands/
        ├── user.ts        # 用户查询
        ├── repos.ts       # 仓库查询
        ├── files.ts       # 读取文件与目录结构
        ├── branch.ts      # 创建分支
        ├── commit.ts      # 提交代码
        ├── merge.ts       # 合并分支
        └── utils.ts       # 项目/分支解析工具
```

## 如何分发给他人

1. **打包**: 直接将整个 `gitlab-skills` 文件夹压缩发送给他人。
2. **安装**:
   - 将 `gitlab-skills` 文件夹放入项目根目录。
   - 在项目中配置 AI Skill 指向 `SKILL.md`。
3. **初始化**:
   - 在 AI 对话框中输入：`帮我初始化 GitLab，token 是 [你的Token]，endpoint 是 [你的地址]`。
   - AI 会自动调用 `npx tsx src/index.ts init` 并将配置持久化到当前 skill 目录的 `.env`。
   - 如果目录里只有旧版 `.env.gitlab`，也会自动兼容读取。
   - 无需手动安装依赖，`npx` 会自动处理。

## 核心功能

- **查询用户信息**: `npx tsx src/index.ts user [username]`
- **查询仓库**: `npx tsx src/index.ts repos [关键词]`
- **读取文件内容**: `npx tsx src/index.ts read [项目ID或名称] [文件路径] [ref]`
- **列出目录结构**: `npx tsx src/index.ts tree [项目ID或名称] [路径] [ref] [recursive]`
- **创建分支**: `npx tsx src/index.ts branch [项目ID或名称] [新分支] [基准分支]`
- **提交代码并 push**: `npx tsx src/index.ts commit [项目ID或名称] [目标分支] [提交信息] [actions_json或@文件]`
- **合并分支**: `npx tsx src/index.ts merge [项目ID或名称] [源分支] [目标分支] [标题]`（冲突时会自动返回 MR 地址）

### 提交 actions 格式

`commit` 命令通过 GitLab Commits API 直接在远程分支创建提交，相当于 push 到该分支。第四个参数可以是 JSON 字符串，也可以是 `@actions.json` 文件路径。

```json
[
  {
    "action": "update",
    "file_path": "README.md",
    "content": "新的文件内容"
  },
  {
    "action": "create",
    "file_path": "docs/example.md",
    "content": "# Example\n"
  }
]
```

支持的 `action` 包括 `create`、`update`、`delete`、`move`、`chmod`。

## 输出格式

所有命令均输出 JSON 格式：
- **stdout**: 结果数据（JSON）
- **stderr**: 过程日志（合并命令的进度信息）

## 环境要求

- Node.js >= 18（原生支持 fetch）
- 无需安装任何依赖，`npx tsx` 会自动下载 tsx
