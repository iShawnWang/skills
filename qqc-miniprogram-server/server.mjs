import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { state } from './state.mjs'
import { triggerBuild, getLatestCommitHash, sendFeishuNotification } from './build.mjs'

const LOG_FILE = path.join(process.cwd(), 'builds.log')
const PORT = 3000

const HELP_TEXT = `# 乔乔车小程序构建服务 (MCP + HTTP) 帮助文档

该服务提供乔乔车小程序的自动化构建与状态查询功能，支持 MCP 协议与传统 HTTP 接口。

## 🛠 MCP 接入方式

1. **SSE 模式 (标准 MCP)**:
   - **URL**: http://<服务器IP>:3000/sse
   - **传输协议**: SSE (Server-Sent Events)
   - **适用**: Trae, Claude Desktop, Cursor 等 AI 客户端。

2. **Streamable HTTP 模式 (Opencode 兼容)**:
   - **URL**: http://<服务器IP>:3000/mcp
   - **方法**: POST
   - **适用**: Opencode 等需要单接口 POST 调用的工具。

## 🌐 HTTP API 接口 (传统模式)

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| **/help** | GET | 返回本中文帮助文档 (Markdown 格式) |
| **/build** | POST/GET | 触发一次新的小程序构建 |
| **/status** | GET | 返回当前构建状态 (isBuilding: true/false) |
| **/log** | GET | 获取当前或最近一次构建的实时详细日志 |
| **/last-build** | GET | 获取上次成功构建的 Commit Hash 和时间 |
| **/builds** | GET | 获取所有历史构建触发记录 (IP、时间、Commit) |
| **/health** | GET | 服务健康检查 |

---
*注：构建启动、成功或失败时，系统会自动发送实时通知至飞书群。*`

// --- MCP Server Setup ---

const mcpServer = new Server(
  {
    name: "qqc-miniprogram-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具列表处理器
const listToolsHandler = async () => {
  return {
    tools: [
      {
        name: "trigger_build",
        description: "触发新的小程序构建流程。注意：此工具是异步的，调用成功后，请你（AI）务必每隔 20 秒通过 get_build_status 轮询构建状态，直到构建完成（isBuilding 变为 false），最后将结果告知用户。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_build_status",
        description: "检查当前是否正在构建。如果 isBuilding 为 true，表示正在构建中；为 false 表示构建已结束或未开始。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_build_log",
        description: "获取当前或最近一次构建的实时详细日志内容。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_last_build_info",
        description: "获取上次成功构建的详细信息，包括 Commit Hash 和完成时间。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_help",
        description: "获取服务的详细中文帮助文档，包含接口说明和使用指南。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "health_check",
        description: "检查服务的运行健康状态及运行时间。",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
};

// 工具调用处理器
const callToolHandler = async (request) => {
  const { name } = request.params;

  switch (name) {
    case "trigger_build": {
      if (state.isBuilding) {
        return { content: [{ type: "text", text: "A build is already in progress." }], isError: true };
      }
      const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      let commitHash = 'unknown'
      try { commitHash = await getLatestCommitHash() } catch (e) {}
      fs.appendFileSync(LOG_FILE, `[${time}] MCP Trigger, Commit: ${commitHash}\n`)
      triggerBuild()
      return { content: [{ type: "text", text: `Build started. Commit: ${commitHash}\n\n[AI 提示]: 构建已在后台启动。请你现在开始每隔 20 秒调用一次 get_build_status 检查状态，并在构建完成后（isBuilding 变为 false）告知用户结果。你可以通过 get_build_log 获取实时进度。` }] };
    }
    case "get_build_status":
      return { content: [{ type: "text", text: JSON.stringify({ isBuilding: state.isBuilding }, null, 2) }] };
    case "get_build_log":
      return { content: [{ type: "text", text: state.log || "No logs available." }] };
    case "get_last_build_info":
      return { content: [{ type: "text", text: JSON.stringify(state.lastBuild, null, 2) }] };
    case "get_help":
      return { content: [{ type: "text", text: HELP_TEXT }] };
    case "health_check":
      return { content: [{ type: "text", text: JSON.stringify({ status: 'ok', uptime: process.uptime() }, null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

// 注册处理器
mcpServer.setRequestHandler(ListToolsRequestSchema, listToolsHandler);
mcpServer.setRequestHandler(CallToolRequestSchema, callToolHandler);

// --- HTTP & SSE Setup ---

const app = express()

// 针对 /messages 路径不使用 express.json()，避免 SSE 消息流被截断
app.use((req, res, next) => {
  if (req.path === '/messages') {
    next()
  } else {
    express.json()(req, res, next)
  }
})

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '-'
}

// 1. 标准 MCP SSE 连接端点
const sseTransports = new Map();

app.get("/sse", async (req, res) => {
  console.log("New standard SSE connection established");
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  sseTransports.set(sessionId, transport);

  await mcpServer.connect(transport);

  res.on("close", () => {
    console.log(`SSE connection closed: ${sessionId}`);
    sseTransports.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sseTransports.get(sessionId);

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    // 兼容旧版或没有 sessionId 的情况（如果有全局变量的话）
    res.status(400).send("No active SSE transport for this session");
  }
});

// 2. Opencode 兼容端点 (Streamable HTTP 模拟)
app.post("/mcp", async (req, res) => {
  const request = req.body;

  try {
    if (request.method === "tools/list") {
      const result = await listToolsHandler();
      return res.json({ jsonrpc: "2.0", id: request.id, result });
    }

    if (request.method === "tools/call") {
      const result = await callToolHandler(request);
      return res.json({ jsonrpc: "2.0", id: request.id, result });
    }

    res.status(400).json({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    res.status(500).json({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error.message } });
  }
});

// --- 原有 HTTP API 接口 ---

app.get('/help', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.send(HELP_TEXT)
})

const buildHandler = async (req, res) => {
  if (state.isBuilding) return res.status(409).json({ message: 'A build is already in progress.' })
  triggerBuild()
  res.status(202).json({ message: 'Build started.' })
}

app.get('/build', buildHandler)
app.post('/build', buildHandler)
app.get('/status', (req, res) => res.json({ isBuilding: state.isBuilding }))
app.get('/last-build', (req, res) => res.json(state.lastBuild))
app.get('/builds', (req, res) => {
  if (!fs.existsSync(LOG_FILE)) return res.send('No builds yet.')
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(content)
})
app.get('/log', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(state.log)
})
app.get(['/', '/health'], (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

// --- 启动服务 ---

app.listen(PORT, () => {
  const ip = getLocalIP()
  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`Standard SSE: http://localhost:${PORT}/sse`)
  console.log(`Opencode Remote: http://localhost:${PORT}/mcp`)

  sendFeishuNotification(`${process.env.NOTIFICATION_KEYWORD || '[YQ]'} 构建服务已启动 (兼容模式)\n地址: http://${ip}:${PORT}`)
});
