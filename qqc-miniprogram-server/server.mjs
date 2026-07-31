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
import { state, addBuildRecord, getStats, loadStatsFromFile } from './state.mjs'
import { triggerBuild, getLatestCommitHash, sendFeishuNotification } from './build.mjs'

const LOG_FILE = path.join(process.cwd(), 'builds.log')
const PORT = 3000
const SESSION_TIMEOUT = 60 * 60 * 1000 // 1 hour timeout

const HELP_TEXT = `# 乔乔车小程序构建服务 (MCP + HTTP) 帮助文档

该服务提供乔乔车小程序的自动化构建与状态查询功能，支持 MCP 协议与传统 HTTP 接口。

## 🛠 MCP 接入方式

1. **SSE 模式 (标准 MCP)**:
   - **URL**: http://<服务器IP>:3000/sse
   - **传输协议**: SSE (Server-Sent Events)
   - **适用**: Trae, Claude Desktop, Cursor 等 AI 客户端。

## 🌐 HTTP API 接口 (传统模式)

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| **/help** | GET | 返回本中文帮助文档 (Markdown 格式) |
| **/build** | POST/GET | 触发一次新的小程序构建 |
| **/status** | GET | 返回当前构建状态 (isBuilding: true/false) |
| **/log** | GET | 获取当前或最近一次构建的实时详细日志 |
| **/last-build** | GET | 获取上次成功构建的 Commit Hash 和时间 |
| **/builds** | GET | 获取所有历史构建触发记录 (IP、时间、Commit) |
| **/stats** | GET | 获取服务统计信息（启动时间、运行时长、构建总次数、每次执行的IP/Commit/时间） |
| **/menu-query** | GET | 查询平台端管理后台路由对应的源码文件 |
| **/health** | GET | 服务健康检查 |

---
*注：构建启动、成功或失败时，系统会自动发送实时通知至飞书群。*`

// --- Helpers ---

/**
 * 获取菜单树数据，包含超时和日志
 */
async function fetchMenuTree(timeoutMs = 8000) {
  const url = 'https://apideve.yeqiao.cn/dev-api/admin/MenuAd/getSysMenuTree';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  console.log(`[${new Date().toLocaleString()}] 正在从 ${url} 获取菜单树...`);
  const start = Date.now();

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP 错误! 状态码: ${response.status}`);
    }

    const data = await response.json();
    const duration = Date.now() - start;
    console.log(`[${new Date().toLocaleString()}] 菜单树获取成功 (耗时 ${duration}ms)`);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const duration = Date.now() - start;
    if (error.name === 'AbortError') {
      console.error(`[${new Date().toLocaleString()}] 获取菜单树超时，已达到限制时间 ${timeoutMs}ms`);
      throw new Error(`请求超时，耗时超过 ${timeoutMs}ms`);
    }
    console.error(`[${new Date().toLocaleString()}] 获取菜单树出错 (耗时 ${duration}ms): ${error.message}`);
    throw error;
  }
}

// --- MCP Handler Functions ---

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
      {
        name: "query_admin_menu",
        description: "查询平台端 web 管理后台路由对应的源码文件信息。支持输入完整 URL、路径、菜单 ID 或组件文件名(如 RescueOrder)。",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "查询内容，可以是完整 URL、路径、菜单ID 或组件文件名 (如 RescueOrder)",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_stats",
        description: "获取服务统计信息，包括启动时间、运行时长、构建总次数，以及每次执行的 IP、Commit Hash 和时间。",
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
      addBuildRecord({
        ip: 'MCP',
        commitHash,
        timestamp: time,
        source: 'MCP',
      })
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
    case "query_admin_menu": {
      const { query } = request.params.arguments;
      if (!query) {
        return { content: [{ type: "text", text: "Please provide a query string (URL, path, or ID)." }], isError: true };
      }

      // 提取 ID
      let targetId = query.trim();
      if (targetId.includes('/')) {
        const parts = targetId.split('/');
        targetId = parts[parts.length - 1];
      }

      try {
        const data = await fetchMenuTree();

        const findMenu = (nodes, id) => {
          for (const node of nodes) {
            // 匹配 路径、ID、文件名(component/description)、名称(name) 或 中文标题(label)
            if (
              node.path === id ||
              String(node.id) === id ||
              (node.component && (node.component === id || node.component.endsWith('/' + id))) ||
              (node.description && (node.description === id || node.description.endsWith('/' + id))) ||
              node.name === id ||
              node.label === id
            ) return node;
            if (node.children && node.children.length > 0) {
              const found = findMenu(node.children, id);
              if (found) return found;
            }
          }
          return null;
        };

        const result = findMenu(data, targetId);
        if (result) {
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } else {
          return { content: [{ type: "text", text: `No menu item found for: ${query}` }] };
        }
      } catch (error) {
        return { content: [{ type: "text", text: `Error fetching menu tree: ${error.message}` }], isError: true };
      }
    }
    case "get_stats":
      return { content: [{ type: "text", text: JSON.stringify(getStats(), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

// Helper to create a new MCP Server instance
function createMcpServer() {
  const server = new Server(
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
  server.setRequestHandler(ListToolsRequestSchema, listToolsHandler);
  server.setRequestHandler(CallToolRequestSchema, callToolHandler);
  return server;
}

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
const sseSessions = new Map(); // stores { transport, server, lastActive }

app.get("/sse", async (req, res) => {
  console.log("New standard SSE connection established");
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  const server = createMcpServer();

  sseSessions.set(sessionId, {
    transport,
    server,
    lastActive: Date.now()
  });

  await server.connect(transport);

  res.on("close", async () => {
    console.log(`SSE connection closed: ${sessionId}`);
    try {
      await server.close();
    } catch (e) {
      console.error("Error closing server:", e);
    }
    sseSessions.delete(sessionId);
  });
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const session = sseSessions.get(sessionId);

  if (session) {
    session.lastActive = Date.now(); // Update activity timestamp
    await session.transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE transport for this session");
  }
});

// 定时清理过期会话 (每 5 分钟检查一次)
setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, session] of sseSessions.entries()) {
    if (now - session.lastActive > SESSION_TIMEOUT) {
      console.log(`Expiring idle SSE session: ${sessionId}`);
      try {
        await session.server.close();
      } catch (e) {
        console.error(`Error closing expired server ${sessionId}:`, e);
      }
      sseSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

// --- 原有 HTTP API 接口 ---

app.get('/help', (req, res) => {
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.send(HELP_TEXT)
})

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim()
    if (ip) return ip
  }
  const realIP = req.headers['x-real-ip']
  if (realIP) return realIP
  return req.ip || req.socket?.remoteAddress || '-'
}

const buildHandler = async (req, res) => {
  if (state.isBuilding) return res.status(409).json({ message: 'A build is already in progress.' })
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  const ip = getClientIP(req)
  let commitHash = 'unknown'
  try { commitHash = await getLatestCommitHash() } catch (e) {}
  fs.appendFileSync(LOG_FILE, `[${time}] HTTP Trigger (${ip}), Commit: ${commitHash}\n`)
  addBuildRecord({
    ip,
    commitHash,
    timestamp: time,
    source: 'HTTP',
  })
  triggerBuild()
  res.status(202).json({ message: 'Build started.', commitHash, ip, timestamp: time })
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
app.get('/stats', (req, res) => {
  res.json(getStats())
})
app.get('/log', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(state.log)
})

app.get('/menu-query', async (req, res) => {
  const query = req.query.query;
  if (!query) {
    return res.status(400).json({ error: "Please provide a query string (URL, path, or ID)." });
  }

  // 提取 ID
  let targetId = query.trim();
  if (targetId.includes('/')) {
    const parts = targetId.split('/');
    targetId = parts[parts.length - 1];
  }

  try {
    const data = await fetchMenuTree();

    const findMenu = (nodes, id) => {
      for (const node of nodes) {
        // 匹配 路径、ID、文件名(component/description)、名称(name) 或 中文标题(label)
        if (
          node.path === id ||
          String(node.id) === id ||
          (node.component && (node.component === id || node.component.endsWith('/' + id))) ||
          (node.description && (node.description === id || node.description.endsWith('/' + id))) ||
          node.name === id ||
          node.label === id
        ) return node;
        if (node.children && node.children.length > 0) {
          const found = findMenu(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const result = findMenu(data, targetId);
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: `No menu item found for: ${query}` });
    }
  } catch (error) {
    res.status(500).json({ error: `Error fetching menu tree: ${error.message}` });
  }
})

app.get(['/', '/health'], (req, res) => res.json({ status: 'ok', uptime: process.uptime() }))

// --- 启动服务 ---

app.listen(PORT, () => {
  loadStatsFromFile()
  const ip = getLocalIP()
  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`Standard SSE: http://localhost:${PORT}/sse`)

  sendFeishuNotification(`${process.env.NOTIFICATION_KEYWORD || '[YQ]'} 构建服务已启动\n地址: http://${ip}:${PORT}`)
});
