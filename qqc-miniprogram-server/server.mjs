import express from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { state, setBuilding } from './state.mjs'
import { triggerBuild, getLatestCommitHash, sendFeishuNotification } from './build.mjs'

const app = express()
const PORT = 3000
const LOG_FILE = path.join(process.cwd(), 'builds.log')

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

// 触发构建
const buildHandler = async (req, res) => {
  if (state.isBuilding) {
    return res.status(409).json({ message: 'A build is already in progress.' })
  }

  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  // 处理 IPv6 映射的 IPv4 地址 (::ffff:127.0.0.1) 和本地回环 (::1)
  if (ip.includes('::ffff:')) {
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

// 获取所有构建日志
app.get('/builds', (req, res) => {
  if (!fs.existsSync(LOG_FILE)) {
    return res.send('No builds yet.')
  }
  const content = fs.readFileSync(LOG_FILE, 'utf-8')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(content)
})

// 获取构建状态
app.get('/status', (req, res) => {
  res.json({ isBuilding: state.isBuilding })
})

// 获取上次构建信息
app.get('/last-build', (req, res) => {
  res.json(state.lastBuild)
})

// 获取最新日志
app.get('/log', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.send(state.log)
})

// 健康检查
app.get(['/', '/health'], (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.listen(PORT, () => {
  const ip = getLocalIP()
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  const keyword = process.env.NOTIFICATION_KEYWORD || '[YQ]'

  console.log(`Server is running on http://localhost:${PORT}`)
  console.log(`Server IP: ${ip}`)

  sendFeishuNotification(`${keyword} 构建服务已启动\n时间: ${time}\n地址: http://${ip}:${PORT}\n环境: ${process.env.NODE_ENV || 'production'}`)
})
