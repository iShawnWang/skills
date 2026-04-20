---
name: gitlab-weekly-report
description: 统计个人 GitLab 提交记录并生成周报。通过分析特定时间段内的 Commits 和代码变更（Diff），按项目和分支自动分类并生成美观的 Markdown 报告。适合用于周报撰写、会议汇报或个人工作回顾。
compatibility: Node.js 18+, TypeScript
---

# GitLab 每周提交记录报告生成器

这是一个符合 Agent Skills 规范的工具，旨在自动化收集和整理 GitLab 上的开发活动。

## 核心功能

- **Commit 自动收集**：自动获取指定时间段内当前用户在所有项目中的提交记录。
- **分支分组缩进**：报告按“项目 -> 分支 -> 提交”的三级结构展示，层次分明。
- **代码变更统计**：分析每个提交的 Diff，统计增加和删除的行数。
- **全中文支持**：生成的报告和终端交互均为中文。
- **灵活配置**：支持自托管 GitLab 实例、自定义日期范围及指定用户查询。

## 快速开始

### 前置条件

1. 安装 Node.js 18+ 和 npm/pnpm。
2. 准备 GitLab API Token（权限需包含：`api`, `read_api`, `read_repository`）。

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量 (可选，或通过 CLI 参数传入)
# 在根目录创建 .env 文件：
# GITLAB_ACCESS_TOKEN=你的Token
# GITLAB_ENDPOINT=http://your-gitlab-url/

# 3. 运行工具
npx ts-node scripts/cli.ts
```

## 使用示例

### 生成上周报告 (默认)
```bash
GITLAB_ACCESS_TOKEN=xxx npx ts-node scripts/cli.ts
```

### 指定日期范围
```bash
npx ts-node scripts/cli.ts --start-date "2024-04-01" --end-date "2024-04-07"
```

### 使用自托管实例并保存到文件
```bash
GITLAB_ENDPOINT=http://172.17.188.125:9001/ npx ts-node scripts/cli.ts > weekly-report.md
```

## 配置说明

### 环境变量

| 变量名 | 是否必填 | 说明 |
|----------|----------|-------------|
| `GITLAB_ACCESS_TOKEN` | ✅ 是 | GitLab 个人访问令牌 |
| `GITLAB_ENDPOINT` | ❌ 否 | GitLab 实例 URL (例如: http://172.17.188.125:9001/) |
| `GITLAB_USERNAME` | ❌ 否 | 目标用户名 (默认自动检测 Token 所有者) |

### 命令行参数

- `--start-date <YYYY-MM-DD>`: 统计起始日期
- `--end-date <YYYY-MM-DD>`: 统计结束日期
- `--gitlab-url <url>`: GitLab 实例地址
- `--username <name>`: 指定查询的用户名
- `--help`: 查看帮助

## 报告结构示例

```markdown
# 每周工作提交报告: 用户名 📊
*统计时间: 2024-04-13 至 2024-04-20*

## 📈 活动摘要
- **总提交数**: N
- **活跃项目数**: M
- **预估变更**: +X / -Y 行

## 🚀 项目详细详情

### 项目 A (N 条提交)
*项目变更: +X / -Y*

- **分支: feat/feature-name** (K 条提交)
  - 提交信息 (+A/-B) [🔗](链接)
  - ...
```

## 注意事项

- **数据过滤**：工具会自动过滤掉非本人的提交以及所有的 Merge 类提交（如 `Merge branch...`）。
- **隐私安全**：所有处理均在本地进行，Token 不会被上传或记录。
- **性能限制**：为了防止触发 API 速率限制，代码变更统计仅分析每个项目最近的 20 条提交。

---

**需要帮助？** 请运行：`npx ts-node scripts/cli.ts --help`
