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

该服务提供乔乔车小程序的自动化构建与状态查询功能。

## 🛠 MCP 工具接口 (SSE 模式)
如果你在 AI 客户端 (如 Trae, Claude Desktop) 中使用，可以调用以下工具：

- **trigger_build**: 触发一个新的小程序构建流程。
- **get_build_status**: 检查当前是否正在构建。
- **get_build_log**: 获取当前或最近一次构建的实时日志。
- **get_last_build_info**: 获取上次成功构建的 Commit Hash 和时间。
- **get_all_build_logs**: 获取历史构建简要记录。
- **get_help**: 获取本帮助文档。
- **health_check**: 服务健康检查。

## 🌐 HTTP API 接口
你也可以通过 curl 或浏览器直接调用：

- **GET /help**: 返回本中文文档。
- **POST /build**: 触发构建 (同 GET /build)。
- **GET /status**: 获取构建状态。
- **GET /log**: 获取最新构建日志。
- **GET /last-build**: 获取上次构建信息。
- **GET /builds**: 获取所有历史记录。
- **GET /health**: 健康检查。

## 🔗 远程连接配置 (SSE)
- **URL**: http://<服务器IP>:3000/sse
- **传输方式**: SSE (Server-Sent Events)

---
*注：构建过程中的详细日志会同步发送至飞书通知群。*`

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

// 注册工具列表
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger_build",
        description: "Trigger a new mini-program build process",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_build_status",
        description: "Check if a build is currently in progress",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_build_log",
        description: "Get the latest logs from the current or most recent build",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_last_build_info",
        description: "Get information about the last successful build (commit hash and timestamp)",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_all_build_logs",
        description: "Get the history of all builds from the log file",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_help",
        description: "Get the human-readable help documentation in Chinese",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "health_check",
        description: "Check the health and uptime of the MCP server",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// 处理工具调用
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

  switch (name) {
    case "trigger_build": {
      if (state.isBuilding) {
        return {
          content: [{ type: "text", text: "A build is already in progress." }],
          isError: true,
        };
      }

      const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      let commitHash = 'unknown'

      try {
        commitHash = await getLatestCommitHash()
      } catch (error) {
        console.error('Failed to get commit hash:', error)
      }

      const logEntry = `[${time}] MCP SSE Trigger, Commit: ${commitHash}\n`
      fs.appendFileSync(LOG_FILE, logEntry)

      triggerBuild()
      return {
        content: [{ type: "text", text: `Build started. Commit: ${commitHash}` }],
      };
    }

    case "get_build_status": {
      return {
        content: [{ type: "text", text: JSON.stringify({ isBuilding: state.isBuilding }, null, 2) }],
      };
    }

    case "get_build_log": {
      return {
        content: [{ type: "text", text: state.log || "No logs available." }],
      };
    }

    case "get_last_build_info": {
      return {
        content: [{ type: "text", text: JSON.stringify(state.lastBuild, null, 2) }],
      };
    }

    case "get_all_build_logs": {
      if (!fs.existsSync(LOG_FILE)) {
        return {
          content: [{ type: "text", text: "No builds yet." }],
        };
      }
      const content = fs.readFileSync(LOG_FILE, 'utf-8')
      return {
        content: [{ type: "text", text: content }],
      };
    }

    case "get_help": {
      return {
        content: [{ type: "text", text: HELP_TEXT }],
      };
    }

    case "health_check": {
      return {
        content: [{ type: "text", text: JSON.stringify({ status: 'ok', uptime: process.uptime() }, null, 2) }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// --- HTTP & SSE Setup ---

const app = express()

function getLocalIP() {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '-'
}

app.use(express.json())

// SSE 传输对象管理
let transport = null;

// MCP SSE 连接端点
app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");
  transport = new SSEServerTransport("/messages", res);
  await mcpServer.connect(transport);
});

// MCP 消息处理端点
app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE transport");
  }
});

// --- 原有 HTTP API 接口 ---

// 帮助接口
app.get('/help', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.send(HELP_TEXT)
})

const buildHandler = async (req, res) => {
  if (state.isBuilding) {
    return res.status(409).json({ message: 'A build is already in progress.' })
  }

  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  if (ip && ip.includes('::ffff:')) {
    ip = ip.split(':').pop()
  } else if (ip === '::1') {
    ip = '127.0.0.1'
  }

  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  let commitHash = 'unknown'

  try {
    commitHash = await getLatestCommitHash()
  } catch (error) {
    console.error('Failed to get commit hash:', error)
  }

  const logEntry = `[${time}] IP: ${ip}, Commit: ${commitHash}\n`
  fs.appendFileSync(LOG_FILE, logEntry)

  triggerBuild()
  res.status(202).json({ message: 'Build started.', commit: commitHash })
}

app.get('/build', buildHandler)
app.post('/build', buildHandler)

app.get('/builds', (req, res) => {
  if (!fs.existsSync(LOG_FILE)) {
    return res.send('No builds yet.')
  }
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(content)
})

app.get('/status', (req, res) => {
  res.json({ isBuilding: state.isBuilding })
})

app.get('/last-build', (req, res) => {
  res.json(state.lastBuild)
})

app.get('/log', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(state.log)
})

app.get(['/', '/health'], (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), mcp: 'SSE enabled' })
})

// --- 启动服务 ---

app.listen(PORT, () => {
  const ip = getLocalIP()
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  const keyword = process.env.NOTIFICATION_KEYWORD || '[YQ]'

  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`SSE Endpoint: http://localhost:${PORT}/sse`)
  console.log(`Help Endpoint: http://localhost:${PORT}/help`)
  console.log(`Server IP: ${ip}`)

  sendFeishuNotification(`${keyword} 构建服务已启动 (HTTP + MCP SSE)\n时间: ${time}\n地址: http://${ip}:${PORT}\n环境: ${process.env.NODE_ENV || 'production'}`)
})
