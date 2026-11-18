import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  state,
  setBuilding,
  setLastBuild,
  clearLog,
  appendLog,
  addBuildRecord,
  enqueueBuild,
  dequeueNext,
  isProjectBusy,
  getQueueSnapshot,
} from './state.mjs'
import { getProject, repoCwd, projectWebhook } from './projects.mjs'

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

const MAX_QUEUE = 10

export const BUILD_LOG_FILE = path.join(process.cwd(), 'builds.log')

function now() {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

/**
 * 跑一条命令，返回退出码与输出。
 * 必须收集输出 —— 否则 checkout 失败时日志里只有 "code 1"，
 * 看不出是"目录不是 git 仓库"还是"分支不存在"还是"工作区有未提交改动"。
 */
function runCommand(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd })
    let output = ''
    let settled = false
    const settle = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      output += data.toString()
    })
    child.on('error', (err) => settle({ code: -1, error: err.message, output: '' }))
    child.on('close', (code) => settle({ code, output: output.trim() }))
  })
}

/**
 * 构建前的环境自检：确认 PROJECT_PATH 已配置、目录存在、是 git 仓库。
 * 这些条件不满足时 checkout 必失败，提前给出能直接照做的报错，
 * 比让用户在 "code 1" 里猜要好。
 */
export function checkProjectEnvironment(project) {
  const cwd = repoCwd()
  if (!cwd) {
    return `没有配置 PROJECT_PATH，无法确定小程序仓库目录。请在 .env 里加上 PROJECT_PATH=<小程序仓库绝对路径>（两个项目共用这一个目录）`
  }
  if (!fs.existsSync(cwd)) {
    return `小程序仓库目录不存在: ${cwd}（来自 PROJECT_PATH），请检查该配置`
  }
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    return `目录不是 git 仓库: ${cwd}（来自 PROJECT_PATH，缺少 .git），请把它指向小程序仓库目录`
  }
  return null
}

/**
 * 读取项目分支的 HEAD。
 * 共用目录下必须读分支 ref 而不是 HEAD —— 否则目录停在另一条分支时会记成别的项目的 commit。
 */
export function getLatestCommitHash(project) {
  const cwd = repoCwd()
  const branch = project.branch
  return new Promise((resolve, reject) => {
    const git = spawn('git', ['rev-parse', '--short', `refs/heads/${branch}`], { cwd })
    let hash = ''
    git.stdout.on('data', (data) => {
      hash += data.toString()
    })
    git.on('error', (err) => reject(err))
    git.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to get latest commit hash for ${branch}`))
        return
      }
      resolve(hash.trim())
    })
  })
}

export async function sendFeishuNotification(message, project) {
  const webhook = project ? projectWebhook(project) : process.env.FEISHU_WEBHOOK_URL
  if (!webhook) {
    console.error('FEISHU_WEBHOOK_URL is not defined in .env')
    return
  }
  try {
    const response = await fetch(webhook, {
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

function writeBuildLog(line) {
  try {
    fs.appendFileSync(BUILD_LOG_FILE, line + '\n')
  } catch (e) {
    console.error(`[build] Failed to append to ${BUILD_LOG_FILE}:`, e.message)
  }
}

/**
 * 真正执行构建：先 checkout 到项目分支，再 pnpm run ci:dev。
 *
 * 顺序不能交换 —— pnpm 在 checkout 之前就从当前目录的 package.json 解析脚本名，
 * 目录停在别的小程序分支时会执行那一份写死别的 appid 的 ci:dev（见设计文档 §5.10）。
 */
async function executeBuild(project, job) {
  const id = project.id
  const cwd = repoCwd()
  const startTime = now()

  setBuilding(id, true)
  clearLog(id)
  appendLog(id, `Starting build for ${id} (${project.label})\n`)
  appendLog(id, `Working directory: ${cwd}\n`)
  appendLog(id, `Branch: ${project.branch}\n`)
  appendLog(
    id,
    `Requested commit: ${job.requestedCommit || 'unknown'} (triggered by ${job.source} ${job.ip} at ${job.requestedAt})\n\n`,
  )

  writeBuildLog(
    `[${startTime}] ${job.source} Trigger, project: ${id}, commit: ${job.requestedCommit || 'unknown'}, ip: ${job.ip}`,
  )
  addBuildRecord({
    project: id,
    ip: job.ip,
    commitHash: job.requestedCommit || 'unknown',
    timestamp: startTime,
    source: job.source,
  })

  // 第 0 步：环境自检（目录存在、是 git 仓库、分支存在）
  const envProblem = checkProjectEnvironment(project)
  if (envProblem) {
    appendLog(id, `环境自检失败：${envProblem}\n`)
    await failBuild(project, job, '环境自检', -1, envProblem)
    return
  }

  const branchCheck = await runCommand('git', ['rev-parse', '--verify', `refs/heads/${project.branch}`], cwd)
  if (branchCheck.code !== 0) {
    const msg = `分支 ${project.branch} 在 ${cwd} 里不存在，请确认 PROJECT_PATH 指向了正确的小程序仓库，且该分支已 fetch 下来`
    appendLog(id, `${msg}\n`)
    await failBuild(project, job, '环境自检', branchCheck.code, msg)
    return
  }

  // 第 1 步：切到项目分支
  appendLog(id, `$ git checkout ${project.branch}\n`)
  const checkout = await runCommand('git', ['checkout', project.branch], cwd)
  if (checkout.code !== 0) {
    const detail = [checkout.error, checkout.output].filter(Boolean).join(' | ')
    appendLog(id, `\ngit checkout failed with code ${checkout.code}\n${detail}\n`)
    await failBuild(project, job, 'git checkout', checkout.code, detail)
    return
  }

  // 第 2 步：跑项目构建脚本（脚本名必须在 checkout 之后解析）
  appendLog(id, `\n$ pnpm run ${project.buildScript}\n`)
  const buildProcess = spawn('pnpm', ['run', project.buildScript], { cwd })

  let settled = false
  const settle = async (code, errorMessage) => {
    if (settled) return
    settled = true

    if (code === 0) {
      appendLog(id, '\nBuild successful\n')
      // 构建结束后重新取分支 ref：此时 ci:dev 里的 git pull 已完成，拿到的是真正被上传的 commit
      try {
        const hash = await getLatestCommitHash(project)
        setLastBuild(id, hash)
        appendLog(id, `Commit hash: ${hash}\n`)
        await sendFeishuNotification(
          `${project.notifyPrefix} 构建发布成功\n时间: ${now()}\nCommit: ${hash}`,
          project,
        )
      } catch (e) {
        appendLog(id, `Failed to read commit hash after build: ${e.message}\n`)
        await sendFeishuNotification(
          `${project.notifyPrefix} 构建发布成功 (获取 Commit Hash 失败)\n时间: ${now()}`,
          project,
        )
      }
      finishBuild(project)
      return
    }

    if (errorMessage) appendLog(id, `\npnpm spawn failed: ${errorMessage}\n`)
    await failBuild(project, job, `pnpm run ${project.buildScript}`, code)
  }

  buildProcess.stdout.on('data', (data) => appendLog(id, data.toString()))
  buildProcess.stderr.on('data', (data) => appendLog(id, data.toString()))
  buildProcess.on('error', (err) => settle(-1, err.message))
  buildProcess.on('close', (code) => settle(code))
}

/** 失败统一出口：写日志、推飞书（带失败步骤与仍在排队的项目）、出队继续。 */
async function failBuild(project, job, step, code, detail) {
  const id = project.id
  const time = now()
  appendLog(id, `\nBuild failed at step: ${step} (code ${code})\n`)

  const queue = getQueueSnapshot()
  const queuedText = queue.length
    ? `\n仍在排队: ${queue.map((q) => `${q.project}(第${q.position}位)`).join(', ')}`
    : ''
  // 把具体原因带进飞书通知，否则群里只看到 "失败"，还得有人来翻日志
  const detailText = detail ? `\n原因: ${detail}` : ''

  await sendFeishuNotification(
    `${project.notifyPrefix} 构建发布失败\n时间: ${time}\n失败步骤: ${step}\n错误代码: ${code}${detailText}${queuedText}\n请访问 /log?project=${id} 查看详细构建日志。`,
    project,
  )
  finishBuild(project)
}

/** 本次构建收尾：清 running、开下一个。 */
function finishBuild(project) {
  setBuilding(project.id, false)
  state.running = null
  startNextJob()
}

/** 队列里下一个该谁跑。返回是否启动了新构建。 */
export function startNextJob() {
  if (state.running) return false
  const next = dequeueNext()
  if (!next) {
    return false
  }
  const project = getProject(next.project)
  if (!project) {
    console.error(`[build] 队列里的项目 ${next.project} 不在注册表中，已跳过`)
    return startNextJob()
  }
  state.running = project.id
  executeBuild(project, next)
  return true
}

/**
 * 触发一次构建。
 * 返回 { started } | { queued, position } | { busy } | { full } | { invalid, message }
 *
 * 注意：先占位（enqueue 或设置 running）再 await 取 commit hash。
 * 共用目录同一时刻只能跑一个构建，如果等 hash 回来才占位，
 * 两个项目几乎同时触发时会双双通过 isProjectBusy 检查、同时开跑。
 */
export async function triggerBuild(project, job = {}) {
  const id = project.id

  // 配置错了就别占位、别入队 —— 直接把可照做的原因回给调用方
  const envProblem = checkProjectEnvironment(project)
  if (envProblem) return { invalid: true, message: envProblem }

  if (isProjectBusy(id)) return { busy: true }
  if (state.queue.length >= MAX_QUEUE) return { full: true }

  const item = {
    project: id,
    ip: job.ip || '-',
    source: job.source || 'HTTP',
    requestedAt: now(),
    requestedCommit: null,
  }

  let position = null
  if (state.running) {
    position = enqueueBuild(item)
  } else {
    state.running = id
  }

  try {
    item.requestedCommit = await getLatestCommitHash(project)
  } catch (_) {}

  if (position !== null) {
    return { queued: true, position, requestedCommit: item.requestedCommit }
  }

  executeBuild(project, item)
  return { started: true, requestedCommit: item.requestedCommit }
}
