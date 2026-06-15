# GitLab Weekly Commit Report Generator 📊

一个用于从 GitLab 自动生成精美、详细的每周提交记录报告的 CLI 工具。非常适合用于团队同步会议、绩效回顾或个人工作追踪。

## 核心特性

✨ **自动活动分析**
- 自动收集指定时间段内的所有 Commit 记录。
- 自动过滤非本人提交及 Merge 类提交。
- 按 **项目 -> 分支 -> 提交** 的三级结构自动分组，支持缩进展示。

📈 **代码变更统计**
- 自动分析每个提交的 Diff。
- 统计增加/删除的行数，提供直观的开发工作量参考。

🎯 **全中文支持**
- 生成的报告内容、统计摘要及工具交互均为中文。

⚡ **快速高效**
- 采用并行 API 请求，大幅提升数据获取速度。
- 智能限制 Diff 分析范围，兼顾深度与性能。

## 快速开始

### 前置条件
- Node.js 18+
- npm 或 pnpm
- GitLab 个人访问令牌 (Personal Access Token)

### 安装

```bash
# 进入项目目录
cd weekly-summary

# 安装依赖
npm install
```

### 获取 GitLab Token

1. 访问 https://gitlab.com/-/user_settings/personal_access_tokens (或你的自托管 GitLab 实例)。
2. 点击 "Add new token"。
3. 名称填写: "Weekly Report CLI"。
4. 勾选范围 (Scopes): `api`, `read_api`, `read_repository`。
5. 创建并复制生成的 Token（仅显示一次）。

### 生成第一份报告

```bash
GITLAB_ACCESS_TOKEN=你的Token npx ts-node scripts/cli.ts > weekly-summary.md
```

这将生成过去 7 天的报告并保存到 `weekly-summary.md`。

## 使用示例

### 基础用法
```bash
GITLAB_ACCESS_TOKEN=glpat-xxx npx ts-node scripts/cli.ts
```

### 指定日期范围
```bash
npx ts-node scripts/cli.ts --start-date "2024-04-01" --end-date "2024-04-07"
```

### 使用自托管 GitLab 实例
```bash
GITLAB_ENDPOINT=http://172.17.188.125:9001/ npx ts-node scripts/cli.ts
```

### 保存到文件
```bash
npx ts-node scripts/cli.ts > weekly-summary.md
```

## 配置说明

### 环境变量

你可以在当前 skill 安装目录执行初始化命令来持久化配置：

```bash
npx ts-node scripts/cli.ts init --gitlab-token "glpat-xxx" --gitlab-url "http://your-gitlab-url/" --username "your.username"
```

也可以手动维护同目录下的 `.env`：

```env
GITLAB_ACCESS_TOKEN=glpat-xxx
GITLAB_ENDPOINT=http://your-gitlab-url/
GITLAB_USERNAME=your.username
```

## 项目结构
```
weekly-summary/
├── scripts/
│   ├── cli.ts                # CLI 入口
│   ├── gitlab-client.ts       # GitLab API 封装
│   └── report-generator.ts    # 报告生成逻辑
├── package.json
├── tsconfig.json
└── SKILL.md                   # Agent Skill 规范文档
```

## 常见问题排查

### "401 Unauthorized"
- 检查 Token 是否正确且未过期。
- 确保 Token 拥有 `api` 权限。

### "未发现提交活动"
- 检查日期范围是否包含你的提交。
- 确保使用了正确的 GitLab 实例地址。

## 许可证

MIT
