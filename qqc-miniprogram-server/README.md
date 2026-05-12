# QQC 小程序自动化构建服务 (qqc-miniprogram-server)

这是一个基于 Node.js 的轻量级自动化构建服务，用于接收 HTTP 请求并触发指定小程序的构建与发布流程，同时支持飞书通知和构建日志查看。

## 核心功能

- **触发构建**: 通过 `GET/POST /build` 触发小程序构建。
- **状态监控**: 提供 `/status`、`/last-build` 接口查看当前和历史构建状态。
- **日志查看**: 提供 `/log` 查看实时构建日志，`/builds` 查看历史构建记录。
- **健康检查**: 根路径 `/` 和 `/health` 返回服务运行状态。
- **飞书通知**: 构建成功或失败后自动发送通知到飞书群机器人。

## 快速开始

### 1. 环境准备

- Node.js (建议 v18+)
- pnpm

### 2. 配置 .env

在项目根目录下创建 `.env` 文件，并配置以下变量：

```env
# 飞书机器人 Webhook 地址
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/...

# 通知消息的前缀关键字
NOTIFICATION_KEYWORD=[YQ]

# 需要构建的小程序项目所在的绝对路径
PROJECT_PATH=/Users/qckj/work/qqc-miniprogram
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 部署运行

使用 PM2 进行持久化部署：

```bash
pnpm run server
```

或者直接启动：

```bash
pnpm start
```

## 接口说明

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/` | GET | 健康检查，返回 status: ok 和 uptime |
| `/health` | GET | 同上 |
| `/build` | GET/POST | 触发一次构建 (如果当前正在构建则返回 409) |
| `/status` | GET | 返回当前是否正在构建 (`isBuilding`) |
| `/last-build` | GET | 返回上次构建成功的 Commit Hash |
| `/log` | GET | 返回当前/最近一次构建的详细控制台日志 |
| `/builds` | GET | 返回所有历史构建请求记录 (IP、时间、Commit) |

## 项目结构

- `server.mjs`: Express 服务入口，处理 API 路由。
- `build.mjs`: 构建逻辑实现，负责执行 `pnpm run ci:dev` 和发送通知。
- `state.mjs`: 内存状态管理，保存构建状态和实时日志。
- `.env`: 敏感配置和项目路径配置。
