---
name: "zentao-skill"
description: "内网禅道集成插件。用于登录 ZenTao/禅道实例，获取指派给当前用户的 Bug，给 Bug 提交评论，关闭 Bug，或诊断禅道表单与路由。"
---

# Zentao Skill

此 Skill 用于操作内网禅道，默认实例地址为 `http://10.10.254.52/zentao`。

## 执行须知

- **工作目录**: 所有指令在 `zentao-skill/` 下执行，或使用绝对路径 `npx tsx /path/to/zentao-skill/src/index.ts`。
- **输出格式**: stdout 输出 JSON；stderr 输出过程日志。
- **环境要求**: Node.js >= 18。运行时只依赖 Node 内置 `fetch`，开发运行可用 `npx tsx`。
- **配置路径**: 固定读取当前 Skill 安装目录下的 `.env`，账号密码只写入这个文件。
- **凭据安全**: `.env` 权限会设为 `600`。不要把 `.env` 提交到 git。

## 配置规则

- 每次调用本 Skill 时，先运行 `npx tsx src/index.ts config` 检查当前 Skill 安装目录是否已有 `.env`。
- 如果 `.env` 已存在且包含 `ZENTAO_USERNAME`、`ZENTAO_PASSWORD`，直接继续执行用户请求，不要再次询问账号密码。
- 只有 `.env` 不存在或缺少必要字段时，才提示用户提供禅道用户名和密码，并执行初始化。

## 首次初始化

用户安装完 Skill 后第一次调用，如果 `config` 显示未配置，向用户索取禅道用户名和密码。AI 会执行：

```bash
npx tsx src/index.ts init <username> <password> [baseUrl]
```

`baseUrl` 可省略，默认 `http://10.10.254.52/zentao`。如果用户给的是 `http://10.10.254.52/zentao/my/`，CLI 会自动归一化到实例根路径。

## 核心命令

### 1. 登录检测

```bash
npx tsx src/index.ts whoami
```

用于确认账号密码、Cookie、实例地址是否可用。

### 2. 获取指派给我的 Bug

```bash
npx tsx src/index.ts bugs
```

默认从 `my/` 页面抓取 Bug 链接和行信息，输出 `id/title/status/severity/priority/link/rawText` 等可解析字段。禅道版本差异较大时，先执行 `diagnose`。

### 3. 提交 Bug 评论

```bash
npx tsx src/index.ts comment <bugId> <comment>
```

先尝试常见 ZenTao 路由 `action-comment-bug-{id}.html`。如果当前实例拒绝该通用评论路由，则自动回退到 `bug-edit-{id}.html` 表单里的 `comment` 字段提交备注。回退路径使用浏览器同款 `multipart/form-data`，并从页面脚本提取动态 `uid/kuid` 一起提交。提交后可读取 `bug-view-{id}.html` 确认备注是否出现在历史记录里。

### 4. 获取 Bug 详情

```bash
npx tsx src/index.ts detail <bugId> [--include-media]
```

读取 `bug-view-{id}.html`，输出标题、重现步骤、右侧基本信息、Bug 生命周期、历史记录和非媒体附件链接。默认忽略图片、视频等媒体附件内容，不下载附件；只有用户明确要求查看图片/视频等附件时，才传 `--include-media` 并继续处理附件链接。

### 5. 指派 Bug

```bash
npx tsx src/index.ts assign <bugId> <assignedTo> [comment] [--mailto=user1,user2] [--dry-run]
```

读取 `bug-assignTo-{id}.html?onlybody=yes` 表单，提交 `assignedTo`、`status`、`mailto[]`、`comment` 和页面脚本里的动态 `uid/kuid`。默认保持表单中的状态，通常为 `active`。写操作前必须确认目标 Bug ID、接收人账号和备注。需要只验证表单解析时使用 `--dry-run`。

### 6. 解决 Bug

```bash
npx tsx src/index.ts resolve <bugId> [resolution] [comment] [--build=trunk] [--assigned-to=account] [--dry-run]
```

读取 `bug-resolve-{id}.html?onlybody=yes` 表单，使用浏览器同款 `multipart/form-data` 提交 `resolution`、`resolvedBuild`、`resolvedDate`、`assignedTo`、`status=resolved`、`comment` 和页面脚本里的动态 `uid/kuid`。默认 `resolution=fixed`，默认解决版本为表单值；表单为空时使用 `trunk`。写操作前必须确认目标 Bug ID、解决方案、解决版本和备注。需要只验证表单解析时使用 `--dry-run`。

### 7. 关闭 Bug

```bash
npx tsx src/index.ts close <bugId> [resolution] [comment]
```

`resolution` 默认 `fixed`。常见值包括 `fixed`、`duplicate`、`willnotfix`、`notrepro`、`bydesign`、`external`。

### 8. 页面诊断

```bash
npx tsx src/index.ts diagnose [my|login|bug] [bugId]
```

输出页面标题、表单 action/method/input 名称、Bug 链接摘要。用于适配不同禅道版本或内网定制页面。

## 使用原则

- 先执行 `whoami` 验证登录，再执行写操作。
- 写操作前向用户确认目标 Bug ID、评论内容、关闭原因。
- 命令失败时优先运行 `diagnose`，根据表单摘要判断是否需要补充路由或字段。
- 不要在回答中泄露用户密码、Cookie 或 `.env` 内容。
