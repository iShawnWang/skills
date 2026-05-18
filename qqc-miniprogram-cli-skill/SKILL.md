---
name: "乔乔车小程序打包发布 skill"
description: "管理乔乔车小程序的自动化构建服务。支持通过 HTTP API 或 MCP SSE 协议触发构建、查询状态和获取日志。适用于远程打包机环境。"
---

# 乔乔车小程序打包发布 skill 指南

该 Skill 用于管理位于远程打包机（如 iMac）上的自动化构建服务。支持 **MCP (Model Context Protocol)** 和 **传统 HTTP** 两种调用方式。

## 🌐 服务连接信息

- **服务器地址**: `http://{{iMac_IP}}:{{iMac_Port}}` (默认端口 3000)
- **MCP SSE 端点**: `http://{{iMac_IP}}:{{iMac_Port}}/sse`
- **帮助文档接口**: `http://{{iMac_IP}}:{{iMac_Port}}/help`

---

## 🛠 调用方式

### 1. MCP 模式 (推荐 - 适用于 AI 助手)
在 Trae, Claude Desktop 等 AI 客户端中，配置连接类型为 `sse`，URL 为上面的 SSE 端点。

**可用工具 (Tools):**
- `trigger_build`: 触发新的小程序构建流程。
- `get_build_status`: 检查当前是否正在构建。
- `get_build_log`: 获取最新构建日志。
- `get_last_build_info`: 获取上次成功构建的 Commit Hash。
- `get_help`: 获取详细的中文帮助文档。

### 2. HTTP 模式 (适用于 curl/浏览器/脚本)
- **触发构建**: `POST /build` 或 `GET /build`
- **查看状态**: `GET /status`
- **查看日志**: `GET /log`
- **历史记录**: `GET /builds`
- **获取帮助**: `GET /help`

### 3. 本地 CLI 工具 (qqc_miniprogram_tool.sh)
如果你在打包机本地，可以使用该脚本：
- `./qqc_miniprogram_tool.sh init <IP> <Port>`: 初始化配置。
- `./qqc_miniprogram_tool.sh build`: 触发构建。
- `./qqc_miniprogram_tool.sh log`: 查看日志。

---

## 🚀 第一次初始化流程

1.  **确认 IP**: 询问用户打包机（iMac）的内网 IP。
2.  **配置环境**: 在本地执行 `./qqc_miniprogram_tool.sh init <IP> <Port>`。
3.  **连接验证**: 调用 `health` 或 `get_help` 确保连接通畅。

---

## 💡 常用指令示例 (对 AI 说)

- “帮我发布一下小程序体验版”
- “现在打包进度怎么样了？”
- “查看一下最近一次成功的构建 hash”
- “打包机现在在线吗？”
- “显示打包服务的帮助文档”

---

## ⚠️ 注意事项
- **飞书通知**: 构建结果会自动发送到配置的飞书群机器人。
- **构建冲突**: 如果已有构建在进行中，新的触发请求将返回 409 错误。
- **日志**: `/log` 仅返回当前或最近一次的详细日志；`/builds` 返回所有历史触发记录。
