import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { setBuilding, setLastBuild, clearLog, appendLog } from './state.mjs'

// 加载环境变量
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    content.split('\n').forEach((line) => {
      const [key, ...value] = line.split('=')
      if (key && value.length > 0) {
        process.env[key.trim()] = value.join('=').trim()
      }
    })
  }
}

loadEnv()

const FEISHU_URL = process.env.FEISHU_WEBHOOK_URL
const KEYWORD = process.env.NOTIFICATION_KEYWORD || '[YQ]'
const PROJECT_PATH = process.env.PROJECT_PATH || process.cwd()

export function getLatestCommitHash() {
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['rev-parse', '--short', 'HEAD'], { cwd: PROJECT_PATH })
    let hash = ''
    git.stdout.on('data', (data) => {
      hash += data.toString()
    })
    git.on('close', (code) => {
      if (code === 0) {
        resolve(hash.trim())
      } else {
        reject(new Error('Failed to get latest commit hash'))
      }
    })
  })
}

async function sendFeishuNotification(message) {
  if (!FEISHU_URL) {
    console.error('FEISHU_WEBHOOK_URL is not defined in .env')
    return
  }
  try {
    const response = await fetch(FEISHU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: {
          text: message,
        },
      }),
    })
    const data = await response.json()
    if (data.code !== 0) {
      console.error('Feishu notification failed:', data.msg)
    }
  } catch (error) {
    console.error('Error sending Feishu notification:', error.message)
  }
}

export function triggerBuild() {
  setBuilding(true)
  clearLog()
  appendLog(`Starting build in ${PROJECT_PATH}...\n`)

  const buildProcess = spawn('pnpm', ['run', 'ci:dev'], { cwd: PROJECT_PATH })

  buildProcess.stdout.on('data', (data) => {
    appendLog(data.toString())
  })

  buildProcess.stderr.on('data', (data) => {
    appendLog(data.toString())
  })

  buildProcess.on('close', async (code) => {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    if (code === 0) {
      appendLog('\nBuild successful\n')
      try {
        const hash = await getLatestCommitHash()
        setLastBuild(hash)
        appendLog(`Commit hash: ${hash}\n`)

        // 发送飞书通知
        await sendFeishuNotification(`${KEYWORD} 构建发布成功\n时间: ${time}\nCommit: ${hash}`)
      } catch (error) {
        appendLog(`Failed to set last build info: ${error.message}\n`)
        // 如果获取 hash 失败也尝试发送通知
        await sendFeishuNotification(`${KEYWORD} 构建发布成功 (获取 Commit Hash 失败)\n时间: ${time}`)
      }
    } else {
      appendLog(`\nBuild failed with code ${code}\n`)
      // 发送构建失败的飞书通知
      await sendFeishuNotification(
        `${KEYWORD} 构建发布失败\n时间: ${time}\n错误代码: ${code}\n请访问 /log 接口查看详细构建日志。`,
      )
    }
    setBuilding(false)
  })
}
