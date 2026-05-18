# QQC 小程序自动化构建服务 (qqc-miniprogram-server)

这是一个基于 Node.js 的轻量级自动化构建服务，已升级为 **MCP (Model Context Protocol)** 标准服务器。它支持通过 **MCP SSE**、**Streamable HTTP (Opencode 兼容)** 以及 **传统 HTTP API** 三种方式触发小程序构建与发布流程。

## 核心功能

- **MCP 支持**: 提供标准 MCP 工具接口，适配 Trae、Claude Desktop 等 AI 客户端。
- **兼容模式**: 专门为 Opencode 等工具提供 Streamable HTTP (`/mcp`) 接口。
- **触发构建**: 接收指令后自动执行小程序构建与发布。
- **状态监控**: 实时查看构建进度、上次构建 Hash 以及历史记录。
- **飞书通知**: 构建全过程（启动、成功、失败）自动推送至飞书群。

---

## 🚀 接入方式

### 1. MCP SSE 模式 (标准)
适用于支持标准 MCP 协议的 AI 客户端。
- **URL**: `http://<服务器IP>:3000/sse`
- **传输方式**: SSE (Server-Sent Events)

### 2. Opencode 兼容模式 (Streamable HTTP)
适用于 Opencode 等需要单接口 POST 调用的工具。
- **URL**: `http://<服务器IP>:3000/mcp`
- **方法**: `POST`

### 3. 传统 HTTP API 模式
适用于浏览器、curl 或简单脚本。

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/help` | GET | 返回本中文帮助文档 (Markdown 格式) |
| `/build` | POST/GET | 触发一次新的小程序构建 |
| `/status` | GET | 返回当前构建状态 (isBuilding: true/false) |
| `/log` | GET | 获取当前或最近一次构建的实时详细日志 |
| `/last-build` | GET | 获取上次成功构建的 Commit Hash 和时间 |
| `/builds` | GET | 获取所有历史构建触发记录 (IP、时间、Commit) |
| `/health` | GET | 服务健康检查，返回运行时间和状态 |
| `/` | GET | 同 /health |

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
PROJECT_PATH=/Users/qckj/work/qqc-miniprogram
```

### 3. 安装与运行
```bash
pnpm install
node server.mjs
```

---

## 📋 MCP 工具列表 (Tools)

| 工具名称 | 描述 |
| :--- | :--- |
| `trigger_build` | 触发新的小程序构建流程 |
| `get_build_status` | 检查当前是否正在构建 |
| `get_build_log` | 获取当前或最近一次构建的实时日志 |
| `get_last_build_info` | 获取上次成功构建的 Commit Hash 和时间 |
| `get_help` | 获取详细的中文帮助文档 |
| `health_check` | 服务健康检查 |

---

## 📁 项目结构
- [server.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/server.mjs): 服务入口，集成 MCP (SSE/Streamable) 与 HTTP 路由。
- [build.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/build.mjs): 构建逻辑，负责执行 Shell 命令与飞书通知。
- [state.mjs](file:///Users/qckj/skills/qqc-miniprogram-server/state.mjs): 内存状态管理，保存构建日志与进度。
