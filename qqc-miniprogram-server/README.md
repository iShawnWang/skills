# 小程序自动化构建服务 (qqc-miniprogram-server)

基于 Node.js 的轻量级自动化构建服务，支持 **MCP (Model Context Protocol)** 标准服务器与**传统 HTTP API** 两种方式触发小程序构建与发布。

**目前同时服务两个小程序**：乔乔车（`YQ-QQC`）与车辆交易市场（`YQ-CAR`）。两者共用同一份代码目录，服务在每次构建前先 `git checkout` 到该项目对应的分支。

## 核心功能

- **多小程序支持**: 按 `project` 参数区分构建目标，同一服务实例管理多个小程序。
- **MCP 支持**: 提供标准 MCP 工具接口，适配 Trae、Claude Desktop 等 AI 客户端。
- **串行队列**: 共用代码目录，同一时刻只跑一个构建；另一项目触发时自动排队。
- **状态监控**: 实时查看各项目构建进度、上次构建 Hash 以及历史记录。
- **飞书通知**: 构建全过程（启动、成功、失败）自动推送至飞书群，消息按小程序加前缀。

---

## ⚠️ 必须带 project 参数

`/build`、`/status`、`/log`、`/last-build` 这些按项目区分的接口**必须**指定 `project`。
不传或传错返回 400，并在响应里列出可选值 —— **不会默认成某个小程序**。

| project | 小程序 | 构建分支 | appid |
| :--- | :--- | :--- | :--- |
| `YQ-QQC` | 乔乔车小程序 | `master-mp-test` | `wx72082d541b129ee4` |
| `YQ-CAR` | 车辆交易市场 | `master-mp-car-test` | `wx97dd5b2518e80061` |

`project` 也接受别名：`qqc` / `mp` / `乔乔车` / `car` / `养车` / `车辆交易市场`。

---

## 🚀 接入方式

### 1. MCP SSE 模式 (标准)
适用于支持标准 MCP 协议的 AI 客户端。
- **URL**: `http://<服务器IP>:3000/sse`
- **传输方式**: SSE (Server-Sent Events)

### 2. 传统 HTTP API 模式
适用于浏览器、curl 或简单脚本。

| 接口 | 方法 | project | 说明 |
| :--- | :--- | :--- | :--- |
| `/projects` | GET | - | 列出所有小程序及各自构建状态、队列 |
| `/build` | POST/GET | **必填** | 触发一次构建；另一项目正在构建时自动排队 |
| `/status` | GET | **必填** | 该项目是否在构建、排队第几位 |
| `/log` | GET | **必填** | 该项目当前或最近一次构建的实时日志 |
| `/last-build` | GET | **必填** | 该项目上次成功构建的 Commit Hash 和时间 |
| `/builds` | GET | 可选 | 构建触发记录；带 project 则只返回该项目 |
| `/stats` | GET | 可选 | 服务统计；不带 project 返回全局 + 每项目汇总 |
| `/help` | GET | - | 返回中文帮助文档 (Markdown 格式) |
| `/menu-query` | GET | - | 查询平台端管理后台路由对应的源码文件 |
| `/health` | GET | - | 服务健康检查，返回运行时间和状态 |
| `/` | GET | - | 同 /health |

### 排队语义

- 空闲时触发任一项目 → 立刻开始
- 另一项目正在构建时触发本项目 → 入队，返回 202 `{queued: true, position: n}`
- **同一项目**正在构建或已在队列 → 409
- 队首结束（无论成功失败）后自动启动下一个

轮询判断"是否结束"必须同时满足 `isBuilding === false` **且** `queuePosition === null`，否则排队中的项目会被误判成已完成。

---

## 🛠 快速开始

### 1. 环境准备
- Node.js (v20+)
- pnpm

### 2. 配置 .env
在根目录创建 `.env` 文件：
```env
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...
NOTIFICATION_KEYWORD=[YQ]
# 乔乔车代码目录
PROJECT_PATH=/Users/qckj/work/qqc-miniprogram
# 车辆交易市场代码目录（共用同一份代码时填同一个路径）
PROJECT_PATH_CAR=/Users/qckj/work/qqc-miniprogram
# 可选：车辆交易市场单独的飞书群，不填复用 FEISHU_WEBHOOK_URL
# FEISHU_WEBHOOK_URL_CAR=https://open.feishu.cn/open-apis/bot/v2/hook/...
```

### 3. 安装与运行
```bash
pnpm install
node server.mjs
```

---

## 📋 MCP 工具列表 (Tools)

| 工具名称 | project | 描述 |
| :--- | :--- | :--- |
| `list_projects` | 无 | 列出所有小程序及各自状态。不确定传哪个 project 时先调它。 |
| `trigger_build` | **必填** | 触发构建。返回"已开始"/"已排队(position n)"/"该项目已在构建"。AI 需轮询到 `isBuilding===false && queuePosition===null`。 |
| `get_build_status` | **必填** | 检查该项目构建状态与排队位置 |
| `get_build_log` | **必填** | 获取该项目实时构建日志 |
| `get_last_build_info` | **必填** | 获取该项目上次成功构建的 Hash 和时间 |
| `get_stats` | 可选 | 服务统计；带 project 则只看该项目 |
| `get_help` | 无 | 获取详细中文帮助文档 |
| `health_check` | 无 | 服务健康检查 |
| `query_admin_menu` | 无 | 查询平台端管理后台路由对应的源码文件 |

工具名与旧版保持一致，只是增加了 `project` 参数；旧客户端升级后必须带上 `project`。

---

## 📁 项目结构
- [server.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/server.mjs): 服务入口，MCP (SSE) 与 HTTP 路由。
- [build.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/build.mjs): 构建执行与飞书通知，含串行队列。
- [state.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/state.mjs): 内存状态管理，按项目分组。
- [projects.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/projects.mjs): 项目注册表，所有项目信息的单一来源。

---

## 🚢 部署

> 构建机（`192.168.91.61`）从本机无法直接访问，以下命令需在能登录构建机的环境执行。

### 1. 确认服务进程的工作目录

`stat.log` / `builds.log` / `.env` 都按 `process.cwd()` 解析。**cwd 变了会新建空日志，看起来像历史记录丢了**。

```bash
pm2 describe qqc-mp-server | grep -i cwd
```

下面的 `.env` 与代码必须放在这个目录里。

### 2. 覆盖服务文件并补 .env

把 `server.mjs` / `build.mjs` / `state.mjs` / `projects.mjs` / `README.md` / `.env.example` 复制到上一步的目录。

`.env` 至少补上新键（与已有的 `PROJECT_PATH` 值相同，因为两项目共用一份代码）：

```env
PROJECT_PATH_CAR=/Users/qckj/work/qqc-miniprogram
# 可选，不填则复用 FEISHU_WEBHOOK_URL
# FEISHU_WEBHOOK_URL_CAR=https://open.feishu.cn/open-apis/bot/v2/hook/...
```

### 3. 重启前确认没有构建在跑

队列与 `running` 只在内存，重启会丢失。确认项目都空闲后再重启：

```bash
curl -s 'http://127.0.0.1:3000/projects'
pm2 restart qqc-mp-server
```

### 4. 验证

```bash
# 两个项目都应出现
curl -s 'http://127.0.0.1:3000/projects'

# 不带 project → 400 且列出可选值
curl -s 'http://127.0.0.1:3000/status'

# 别名字段也能命中
curl -s 'http://127.0.0.1:3000/status?project=car'
```

### 5. 前置条件：小程序仓库侧

仓库 `yeqiao-mobile-prods` 的 `master-mp-car` / `master-mp-car-test` 两个分支需要已包含"写死车辆交易市场 appid + 私钥 + checkout master-mp-car-test"的 `ci:dev` 与 `scripts/upload-dev.mjs`（commit `0ca7ef7ab` 起）。改漏的表现是：构建会"成功"，但发出去的是乔乔车。核对：

```bash
cd <小程序仓库>
git show master-mp-car-test:package.json | grep ci:dev
git show master-mp-car-test:scripts/upload-dev.mjs | grep -E 'appid|privateKeyPath'
```
