# GitLab AI Skill

这是一个为 AI 设计的 GitLab 集成插件，支持查询用户、仓库以及自动化合并分支。

使用 TypeScript 编写，零运行时依赖，通过 `npx tsx` 直接执行。

## 文件结构

```
gitlab-skills/
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── .env.gitlab            # 用户配置（自动生成，已 gitignore）
├── .env.gitlab.example    # 配置模板
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
        └── merge.ts       # 合并分支
```

## 如何分发给他人

1. **打包**: 直接将整个 `gitlab-skills` 文件夹压缩发送给他人。
2. **安装**:
   - 将 `gitlab-skills` 文件夹放入项目根目录。
   - 在项目中配置 AI Skill 指向 `SKILL.md`。
3. **初始化**:
   - 在 AI 对话框中输入：`帮我初始化 GitLab，token 是 [你的Token]，endpoint 是 [你的地址]`。
   - AI 会自动调用 `npx tsx src/index.ts init` 并将配置持久化到 `.env.gitlab`。
   - 无需手动安装依赖，`npx` 会自动处理。

## 核心功能

- **查询用户信息**: `npx tsx src/index.ts user [username]`
- **查询仓库**: `npx tsx src/index.ts repos [关键词]`
- **合并分支**: `npx tsx src/index.ts merge [项目ID或名称] [源分支] [目标分支] [标题]`（冲突时会自动返回 MR 地址）

## 输出格式

所有命令均输出 JSON 格式：
- **stdout**: 结果数据（JSON）
- **stderr**: 过程日志（合并命令的进度信息）

## 环境要求

- Node.js >= 18（原生支持 fetch）
- 无需安装任何依赖，`npx tsx` 会自动下载 tsx
