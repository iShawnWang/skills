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
import {
  state,
  getStats,
  loadStatsFromFile,
  getQueueSnapshot,
  getQueuePosition,
} from './state.mjs'
import { triggerBuild, sendFeishuNotification, BUILD_LOG_FILE, checkProjectEnvironment } from './build.mjs'
import { PROJECTS, PROJECT_IDS, resolveProject, warnDuplicateAliases, repoCwd } from './projects.mjs'

const LOG_FILE = BUILD_LOG_FILE
const PORT = 3000
const SESSION_TIMEOUT = 60 * 60 * 1000 // 1 hour timeout

const PROJECT_TABLE = PROJECTS.map((p) => `| \`${p.id}\` | ${p.label} | \`${p.branch}\` | \`${p.appid}\` |`).join('\n')

const HELP_TEXT = `# 小程序构建服务 (MCP + HTTP) 帮助文档

该服务为**多个小程序**提供自动化构建与状态查询功能，支持 MCP 协议与传统 HTTP 接口。

## ⚠️ 重要：构建类接口必须带 project 参数

所有与构建相关、按项目区分的接口（\`/build\`、\`/status\`、\`/log\`、\`/last-build\`）都**必须**指定 \`project\`。
不传或传错会返回 400，并在响应里列出可选值。不传 project **不会**默认成某个小程序。

## 📱 已接入的小程序

| project | 小程序 | 构建分支 | appid |
| :--- | :--- | :--- | :--- |
${PROJECT_TABLE}

两个项目共用同一份代码目录，服务在构建前会先把目录切到该项目对应的分支。
\`project\` 也接受别名，例如 \`qqc\`、\`乔乔车\`、\`car\`、\`养车\`、\`车辆交易市场\`。

## 🛠 MCP 接入方式

1. **SSE 模式 (标准 MCP)**:
   - **URL**: http://<服务器IP>:3000/sse
   - **传输协议**: SSE (Server-Sent Events)
   - **适用**: Trae, Claude Desktop, Cursor 等 AI 客户端。

MCP 工具：\`list_projects\`、\`trigger_build\`、\`get_build_status\`、\`get_build_log\`、\`get_last_build_info\`、\`get_stats\`、\`get_help\`、\`health_check\`、\`query_admin_menu\`。
其中 \`trigger_build\` / \`get_build_status\` / \`get_build_log\` / \`get_last_build_info\` 的 \`project\` 为必填。

## 🌐 HTTP API 接口 (传统模式)

| 接口 | 方法 | project | 说明 |
| :--- | :--- | :--- | :--- |
| **/projects** | GET | - | 列出所有小程序及各自构建状态、队列 |
| **/build?project=xxx** | POST/GET | **必填** | 触发一次构建；另一项目正在构建时自动排队 |
| **/status?project=xxx** | GET | **必填** | 该项目是否在构建、排队第几位 |
| **/log?project=xxx** | GET | **必填** | 该项目当前或最近一次构建的实时日志 |
| **/last-build?project=xxx** | GET | **必填** | 该项目上次成功构建的 Commit 和时间 |
| **/builds** | GET | 可选 | 所有构建触发记录；带 project 则只返回该项目 |
| **/stats** | GET | 可选 | 服务统计；不带 project 返回全局 + 每项目汇总 |
| **/help** | GET | - | 返回本帮助文档 (Markdown) |
| **/menu-query** | GET | - | 查询平台端管理后台路由对应的源码文件 |
| **/health** | GET | - | 服务健康检查 |

### 排队说明

两个小程序共用一份代码目录，因此**同一时刻只会有一个构建在跑**：

- 空闲时触发任一项目 → 立刻开始
- 另一项目正在构建时触发本项目 → 入队，返回 202 \`{queued: true, position: n}\`
- **同一项目**正在构建或已在队列 → 409
- 队首构建结束（无论成功失败）后自动启动下一个

轮询判断"构建是否结束"时，必须同时满足 \`isBuilding === false\` **且** \`queuePosition === null\`，
否则排队中的项目会被误判成"已经构建完成"。

### curl 示例

\`\`\`bash
# 看有哪些小程序
curl 'http://<服务器IP>:3000/projects'

# 触发车辆交易市场的构建
curl -X POST 'http://<服务器IP>:3000/build?project=YQ-CAR'

# 轮询状态
curl 'http://<服务器IP>:3000/status?project=YQ-CAR'

# 看日志
curl 'http://<服务器IP>:3000/log?project=YQ-CAR'
\`\`\`

---
*注：构建启动、成功或失败时，系统会自动发送实时通知至飞书群，并按小程序区分前缀。*`

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

/**
 * 从请求里解析 project。缺省或非法都返回错误信息，不默认成任何项目。
 * 返回 { project } 或 { error }，error 是 HTTP 400 的 body。
 */
function readProject(req) {
  const raw = req.query.project
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || !String(value).trim()) {
    return {
      error: {
        error: 'missing required query parameter: project',
        message: `请指定 project，可选值: ${PROJECT_IDS.join(', ')}`,
        available: PROJECT_IDS,
        hint: 'GET /projects 可查看项目详情',
      },
    }
  }
  const project = resolveProject(value)
  if (!project) {
    return {
      error: {
        error: `unknown project: ${value}`,
        message: `未识别的 project，可选值: ${PROJECT_IDS.join(', ')}`,
        available: PROJECT_IDS,
        hint: 'GET /projects 可查看项目详情',
      },
    }
  }
  return { project }
}

/** MCP 侧同样不默认项目，必填。 */
function readProjectArg(args) {
  const value = args?.project
  if (!value) {
    return { error: `请指定 project 参数，可选值: ${PROJECT_IDS.join(', ')}` }
  }
  const project = resolveProject(value)
  if (!project) {
    return { error: `未识别的 project: ${value}，可选值: ${PROJECT_IDS.join(', ')}` }
  }
  return { project }
}

/** 项目维度的状态快照，给 /status 用。 */
function projectStatus(project) {
  const s = state.projects[project.id]
  return {
    project: project.id,
    label: project.label,
    branch: project.branch,
    isBuilding: s.isBuilding,
    queuePosition: getQueuePosition(project.id),
    running: state.running,
    queueLength: state.queue.length,
  }
}

const PROJECT_SCHEMA = {
  type: 'string',
  enum: PROJECT_IDS,
  description: `小程序项目：${PROJECTS.map((p) => `${p.id} = ${p.label}`).join('、')}`,
}

// --- MCP Handler Functions ---

// 工具列表处理器
const listToolsHandler = async () => {
  return {
    tools: [
      {
        name: "list_projects",
        description: "列出所有已接入的小程序项目（project id、小程序名、构建分支、appid）以及各自当前的构建状态与排队情况。不确定该传哪个 project 时先调用它。",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "trigger_build",
        description: `触发指定小程序的构建流程。必须传 project，可选值：${PROJECT_IDS.join(' / ')}。返回有三种情况，务必区分：(1) 已开始构建；(2) 已入队（另一项目正在构建，返回排队位置 position）；(3) 该项目已在构建或已在队列（isError: true）。调用成功后，请你（AI）每隔 20 秒通过 get_build_status 轮询，直到该项目的 isBuilding === false 且 queuePosition === null 才算真正结束 —— 排队期间 isBuilding 一直是 false，只看 isBuilding 会误判成已完成。最后将结果告知用户。`,
        inputSchema: {
          type: "object",
          properties: { project: PROJECT_SCHEMA },
          required: ["project"],
        },
      },
      {
        name: "get_build_status",
        description: "检查指定小程序当前的构建状态。isBuilding 为 true 表示正在构建中；isBuilding 为 false 且 queuePosition 为 null 才表示既没在构建也没在排队。queuePosition 非 null 表示在队列里排第几位。",
        inputSchema: {
          type: "object",
          properties: { project: PROJECT_SCHEMA },
          required: ["project"],
        },
      },
      {
        name: "get_build_log",
        description: "获取指定小程序当前或最近一次构建的实时详细日志内容。",
        inputSchema: {
          type: "object",
          properties: { project: PROJECT_SCHEMA },
          required: ["project"],
        },
      },
      {
        name: "get_last_build_info",
        description: "获取指定小程序上次成功构建的详细信息，包括 Commit Hash 和完成时间。",
        inputSchema: {
          type: "object",
          properties: { project: PROJECT_SCHEMA },
          required: ["project"],
        },
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
        description: "获取服务统计信息，包括启动时间、运行时长、构建总次数，以及每次执行的 IP、Commit Hash 和时间。可选传入 project 只看该项目。",
        inputSchema: {
          type: "object",
          properties: { project: PROJECT_SCHEMA },
        },
      },
    ],
  };
};

// 工具调用处理器
const callToolHandler = async (request) => {
  const { name } = request.params;
  const args = request.params.arguments || {};

  switch (name) {
    case "list_projects":
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            projects: PROJECTS.map((p) => ({
              id: p.id,
              label: p.label,
              branch: p.branch,
              appid: p.appid,
              isBuilding: state.projects[p.id].isBuilding,
              queuePosition: getQueuePosition(p.id),
              lastBuild: state.projects[p.id].lastBuild,
            })),
            running: state.running,
            queue: getQueueSnapshot(),
          }, null, 2),
        }],
      };
    case "trigger_build": {
      const { project, error } = readProjectArg(args);
      if (error) return { content: [{ type: "text", text: error }], isError: true };

      const result = await triggerBuild(project, { ip: 'MCP', source: 'MCP' });
      const pollHint = `请你现在开始每隔 20 秒调用一次 get_build_status（project: ${project.id}），直到 isBuilding === false 且 queuePosition === null 才算结束。你可以通过 get_build_log 获取实时进度。`;

      if (result.invalid) {
        return {
          content: [{ type: "text", text: `无法构建 ${project.id}：${result.message}` }],
          isError: true,
        };
      }
      if (result.busy) {
        return {
          content: [{ type: "text", text: `A build for ${project.id} is already in progress.` }],
          isError: true,
        };
      }
      if (result.full) {
        return {
          content: [{ type: "text", text: `构建队列已满（上限 10），请稍后再试。` }],
          isError: true,
        };
      }
      if (result.queued) {
        return {
          content: [{
            type: "text",
            text: `Queued for ${project.id} at position ${result.position} (another project is building, running: ${state.running}). Commit: ${result.requestedCommit || 'unknown'}\n\n[AI 提示]: 构建尚未开始，正在排队。${pollHint}`,
          }],
        };
      }
      return {
        content: [{
          type: "text",
          text: `Build started for ${project.id} (${project.branch}). Commit: ${result.requestedCommit || 'unknown'}\n\n[AI 提示]: 构建已在后台启动。${pollHint}`,
        }],
      };
    }
    case "get_build_status": {
      const { project, error } = readProjectArg(args);
      if (error) return { content: [{ type: "text", text: error }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(projectStatus(project), null, 2) }] };
    }
    case "get_build_log": {
      const { project, error } = readProjectArg(args);
      if (error) return { content: [{ type: "text", text: error }], isError: true };
      return { content: [{ type: "text", text: state.projects[project.id].log || "No logs available." }] };
    }
    case "get_last_build_info": {
      const { project, error } = readProjectArg(args);
      if (error) return { content: [{ type: "text", text: error }], isError: true };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ project: project.id, label: project.label, ...state.projects[project.id].lastBuild }, null, 2),
        }],
      };
    }
    case "get_help":
      return { content: [{ type: "text", text: HELP_TEXT }] };
    case "health_check":
      return { content: [{ type: "text", text: JSON.stringify({ status: 'ok', uptime: process.uptime() }, null, 2) }] };
    case "query_admin_menu": {
      const { query } = args;
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
    case "get_stats": {
      const raw = args.project;
      if (raw) {
        const project = resolveProject(raw);
        if (!project) {
          return {
            content: [{ type: "text", text: `未识别的 project: ${raw}，可选值: ${PROJECT_IDS.join(', ')}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(getStats(project.id), null, 2) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(getStats(), null, 2) }] };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

// Helper to create a new MCP Server instance
function createMcpServer() {
  const server = new Server(
    {
      name: "qqc-miniprogram-server",
      version: "2.0.0",
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

// /build 的 GET 与 POST 共用这一个 handler，缺 project 的校验必须写在这里
const buildHandler = async (req, res) => {
  const { project, error } = readProject(req)
  if (error) return res.status(400).json(error)

  const result = await triggerBuild(project, { ip: getClientIP(req), source: 'HTTP' })
  if (result.invalid) {
    return res.status(500).json({
      error: 'project not configured',
      message: result.message,
      project: project.id,
      hint: `在 .env 里配置 PROJECT_PATH，指向小程序仓库的绝对路径`,
    })
  }
  if (result.busy) {
    return res.status(409).json({
      message: `A build for ${project.id} is already in progress.`,
      project: project.id,
    })
  }
  if (result.full) {
    return res.status(429).json({
      message: '构建队列已满，请稍后再试。',
      project: project.id,
      queueLength: state.queue.length,
    })
  }
  if (result.queued) {
    return res.status(202).json({
      message: 'Build queued.',
      project: project.id,
      queued: true,
      position: result.position,
      running: state.running,
      commitHash: result.requestedCommit,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    })
  }
  return res.status(202).json({
    message: 'Build started.',
    project: project.id,
    started: true,
    commitHash: result.requestedCommit,
    ip: getClientIP(req),
    timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
  })
}

app.get('/build', buildHandler)
app.post('/build', buildHandler)

app.get('/projects', (req, res) => {
  res.json({
    projects: PROJECTS.map((p) => ({
      id: p.id,
      label: p.label,
      branch: p.branch,
      appid: p.appid,
      isBuilding: state.projects[p.id].isBuilding,
      queuePosition: getQueuePosition(p.id),
      lastBuild: state.projects[p.id].lastBuild,
    })),
    running: state.running,
    queue: getQueueSnapshot(),
  })
})

app.get('/status', (req, res) => {
  const { project, error } = readProject(req)
  if (error) return res.status(400).json(error)
  res.json(projectStatus(project))
})

app.get('/last-build', (req, res) => {
  const { project, error } = readProject(req)
  if (error) return res.status(400).json(error)
  res.json({
    project: project.id,
    label: project.label,
    ...state.projects[project.id].lastBuild,
  })
})

app.get('/builds', (req, res) => {
  if (!fs.existsSync(LOG_FILE)) return res.send('No builds yet.')
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  const raw = req.query.project
  const value = Array.isArray(raw) ? raw[0] : raw

  if (!value) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.send(content)
  }

  const project = resolveProject(value)
  if (!project) {
    return res.status(400).json({
      error: `unknown project: ${value}`,
      message: `未识别的 project，可选值: ${PROJECT_IDS.join(', ')}`,
      available: PROJECT_IDS,
      hint: 'GET /projects 可查看项目详情',
    })
  }

  // 老记录（升级前）没有 project 字样，归入 YQ-QQC；按行过滤更稳妥
  const legacyPrefixRe = /^(?!.*\bproject:).*(HTTP|MCP) Trigger/
  const lines = content
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false
      const m = line.match(/project:\s*([A-Za-z0-9_-]+)/)
      if (m) return m[1].toLowerCase() === project.id.toLowerCase()
      // 没有 project 字段的是升级前的老记录
      return project.id === PROJECT_IDS[0] && legacyPrefixRe.test(line)
    })

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(lines.length ? lines.join('\n') : `No builds for ${project.id} yet.`)
})

app.get('/stats', (req, res) => {
  const raw = req.query.project
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return res.json(getStats())

  const project = resolveProject(value)
  if (!project) {
    return res.status(400).json({
      error: `unknown project: ${value}`,
      message: `未识别的 project，可选值: ${PROJECT_IDS.join(', ')}`,
      available: PROJECT_IDS,
      hint: 'GET /projects 可查看项目详情',
    })
  }
  res.json(getStats(project.id))
})

app.get('/log', (req, res) => {
  const { project, error } = readProject(req)
  if (error) return res.status(400).json(error)
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(state.projects[project.id].log)
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

warnDuplicateAliases()

app.listen(PORT, () => {
  loadStatsFromFile()
  const ip = getLocalIP()

  // 启动时把仓库目录与自检结果打出来 —— 配置错了当场就能看见，
  // 不用等第一次触发构建失败才发现
  const repo = repoCwd() || '(未配置 PROJECT_PATH)'
  const repoProblem = checkProjectEnvironment(PROJECTS[0])

  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`Standard SSE: http://localhost:${PORT}/sse`)
  console.log(`Repo: ${repo}`)
  console.log(`Projects:\n${PROJECTS.map((p) => ` - ${p.id} (${p.label}) → ${p.branch}`).join('\n')}`)

  if (repoProblem) {
    console.error(`\n⚠ 仓库配置有问题，触发任何构建都会直接失败：\n  ${repoProblem}`)
  }

  sendFeishuNotification(
    `${process.env.NOTIFICATION_KEYWORD || '[YQ]'} 构建服务已启动\n地址: http://${ip}:${PORT}\n已接入小程序:\n${PROJECTS.map((p) => `- ${p.id} ${p.label}`).join('\n')}`,
  )
});
