---
name: "zentao-mcp-server"
description: "内网禅道 HTTP 服务。用于登录 ZenTao/禅道实例，暴露 HTTP 接口查询、评论、指派、解决 Bug，并支持对“新指派给我”的 Bug 做飞书通知。"
---

# Zentao HTTP Server

此服务用于操作内网禅道，默认实例地址为 `http://10.10.254.52/zentao`，通过本地 HTTP API 暴露能力，适合直接被 Postman 或其他脚本调用。

## 执行须知

- **启动方式**: 在 `zentao-mcp-server/` 下执行 `npm run serve` 或 `pnpm serve`。
- **接口风格**: 本地 HTTP `POST` 接口，返回统一 JSON。
- **环境要求**: Node.js >= 18。运行时只依赖 Node 内置 `fetch`，开发运行可用 `npx tsx`。
- **配置路径**: 固定读取当前 Skill 安装目录下的 `.env`，账号密码只写入这个文件。
- **凭据安全**: `.env` 权限会设为 `600`。不要把 `.env` 提交到 git。
- **默认端口**: `3710`，可通过 `.env` 的 `HTTP_PORT` 覆盖。

## 配置规则

- 每次服务处理请求时，先读取当前 Skill 安装目录下的 `.env`。
- 如果 `.env` 已存在且包含 `ZENTAO_USERNAME`、`ZENTAO_PASSWORD`，直接继续执行用户请求，不要再次询问账号密码。
- 只有 `.env` 不存在或缺少必要字段时，才通过 HTTP 初始化接口写入配置。

## 首次初始化

服务本身不再暴露初始化接口。账号密码继续通过当前目录下 `.env` 维护，`baseUrl` 可省略，默认 `http://10.10.254.52/zentao`。如果用户给的是 `http://10.10.254.52/zentao/my/`，服务会自动归一化到实例根路径。

## 核心接口

### 1. 登录检测

```http
POST /login
```

用于确认账号密码、Cookie、实例地址是否可用。

### 2. 获取指派给我的 Bug

```http
POST /list_my_bugs
```

默认从 `my/` 页面抓取 Bug 链接和行信息，输出 `id/title/status/severity/priority/link/rawText` 等可解析字段。禅道版本差异较大时，先执行 `diagnose`。

### 3. 提交 Bug 评论

```http
POST /comment_bug
```

先尝试常见 ZenTao 路由 `action-comment-bug-{id}.html`。如果当前实例拒绝该通用评论路由，则自动回退到 `bug-edit-{id}.html` 表单里的 `comment` 字段提交备注。回退路径使用浏览器同款 `multipart/form-data`，并从页面脚本提取动态 `uid/kuid` 一起提交。提交后可读取 `bug-view-{id}.html` 确认备注是否出现在历史记录里。

### 4. 获取 Bug 详情

```http
POST /bug_detail
```

读取 `bug-view-{id}.html`，输出标题、重现步骤、右侧基本信息、Bug 生命周期、历史记录和附件链接。**默认包含图片、视频等媒体附件链接 (`includeMedia=true`)**。如果需要忽略媒体文件以节省 token，可传 `includeMedia=false`。服务不会自动下载附件，仅返回链接。

### 5. 指派 Bug

```http
POST /assign_bug
```

Body 字段：`bugId`、`assignedTo`、`comment`、`mailto[]`。
读取 `bug-assignTo-{id}.html?onlybody=yes` 表单，提交 `assignedTo`、`status`、`mailto[]`、`comment` 和页面脚本里的动态 `uid/kuid`。默认保持表单中的状态，通常为 `active`。
需要只验证表单解析时可传 `dryRun=true`。

### 6. 解决 Bug

```http
POST /resolve_bug
```

Body 字段：`bugId`、`resolution`、`comment`、`build`、`assignedTo`。
读取 `bug-resolve-{id}.html?onlybody=yes` 表单，使用浏览器同款 `multipart/form-data` 提交 `resolution`、`resolvedBuild`、`resolvedDate`、`assignedTo`、`status=resolved`、`comment` 和页面脚本里的动态 `uid/kuid`。默认 `resolution=fixed`，默认解决版本为表单值；表单为空时使用 `trunk`。
需要只验证表单解析时可传 `dryRun=true`。

### 7. 关闭 Bug

```http
POST /close_bug
```

`resolution` 默认 `fixed`。常见值包括 `fixed`、`duplicate`、`willnotfix`、`notrepro`、`bydesign`、`external`。

### 8. 页面诊断

```http
POST /diagnose
```

输出页面标题、表单 action/method/input 名称、Bug 链接摘要。用于适配不同禅道版本或内网定制页面。

## Watcher

新增“新指派给我”的 Bug 通知接口：

- `POST /watch/start`
- `POST /watch/stop`
- `POST /watch/status`
- `POST /watch/check_now`
- `POST /watch/reset`

比较策略使用“当前快照集”模式：

- 当前轮询的 bug id 集合减去上一轮快照集合，得到新增 bug
- 新增 bug 发送飞书通知
- 然后用当前集合覆盖快照

首次启动 watcher 只建立快照，不通知历史 bug。
启动 watcher 前需要在 `.env` 中配置 `FEISHU_WEBHOOK_URL`。
watcher 的唯一标识直接使用 `assignee`，不再单独传 `watchKey`。
如果需要立刻拉取一次并做 diff，而不是等待下一个轮询周期，调用 `POST /watch/check_now`，Body 传 `assignee`。

## 使用原则

- 先执行 `whoami` 验证登录，再执行写操作。
- 写操作前向用户确认目标 Bug ID、评论内容、关闭原因。
- 命令失败时优先运行 `diagnose`，根据表单摘要判断是否需要补充路由或字段。
- 不要在回答中泄露用户密码、Cookie 或 `.env` 内容。
