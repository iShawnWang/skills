import fs from 'fs'
import path from 'path'
import { PROJECT_IDS } from './projects.mjs'

const STATS_FILE = path.join(process.cwd(), 'stat.log')
const MAX_RECORDS = 500
const DEFAULT_PROJECT = PROJECT_IDS[0]

function createProjectState() {
  return {
    isBuilding: false,
    lastBuild: { commitHash: null, timestamp: null },
    log: '',
  }
}

export const state = {
  projects: Object.fromEntries(PROJECT_IDS.map((id) => [id, createProjectState()])),
  queue: [], // [{ project, ip, source, requestedAt, requestedCommit }]
  running: null, // 当前正在跑的 project id
  startupTime: Date.now(),
  buildRecords: [],
}

/** 取项目状态；id 非法时抛错，避免静默写到别处。 */
export function getProjectState(id) {
  const s = state.projects[id]
  if (!s) throw new Error(`Unknown project: ${id}`)
  return s
}

export function setBuilding(id, status) {
  getProjectState(id).isBuilding = status
}

export function setLastBuild(id, commitHash) {
  const s = getProjectState(id)
  s.lastBuild.commitHash = commitHash
  s.lastBuild.timestamp = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
}

export function clearLog(id) {
  getProjectState(id).log = ''
}

export function appendLog(id, data) {
  getProjectState(id).log += data
}

/**
 * 记录归属哪个项目。
 * 老记录没有 project 字段（本次升级前的历史记录），归入第一个项目（YQ-QQC）。
 */
export function recordBelongsTo(record, id) {
  if (!record) return false
  return normalizeRecord(record).project === id
}

/** 内存归一：老记录补上 project 字段，但不回写文件。 */
function normalizeRecord(record) {
  if (record.project === undefined || record.project === null) {
    return { ...record, project: DEFAULT_PROJECT, legacy: true }
  }
  return record
}

export function loadStatsFromFile() {
  if (!fs.existsSync(STATS_FILE)) return
  try {
    const content = fs.readFileSync(STATS_FILE, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    const records = []
    for (let i = lines.length - 1; i >= 0 && records.length < MAX_RECORDS; i--) {
      try {
        const r = JSON.parse(lines[i])
        records.push(normalizeRecord(r))
      } catch (_) {}
    }
    state.buildRecords = records
  } catch (e) {
    console.error(`[state] Failed to load ${STATS_FILE}:`, e.message)
  }
}

export function addBuildRecord(record) {
  state.buildRecords.unshift(normalizeRecord(record))
  if (state.buildRecords.length > MAX_RECORDS) {
    state.buildRecords.pop()
  }
  try {
    fs.appendFileSync(STATS_FILE, JSON.stringify(record) + '\n')
  } catch (e) {
    console.error(`[state] Failed to append to ${STATS_FILE}:`, e.message)
  }
}

// --- 队列 ---

export function getQueuePosition(id) {
  const idx = state.queue.findIndex((item) => item.project === id)
  return idx === -1 ? null : idx + 1
}

export function isProjectBusy(id) {
  return state.running === id || getQueuePosition(id) !== null
}

export function enqueueBuild(item) {
  state.queue.push(item)
  return state.queue.length
}

export function dequeueNext() {
  return state.queue.shift() || null
}

export function getQueueSnapshot() {
  return state.queue.map((item, i) => ({ project: item.project, position: i + 1 }))
}

// --- 统计 ---

export function getUptimeMs() {
  return Date.now() - state.startupTime
}

export function getBuildCount(id) {
  if (!id) return state.buildRecords.length
  return state.buildRecords.filter((r) => recordBelongsTo(r, id)).length
}

export function getBuildRecords(id) {
  const records = id ? state.buildRecords.filter((r) => recordBelongsTo(r, id)) : state.buildRecords
  return records.slice()
}

function formatUptime() {
  const uptimeMs = getUptimeMs()
  const seconds = Math.floor(uptimeMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  return {
    ms: uptimeMs,
    human: `${days}天 ${hours % 24}小时 ${minutes % 60}分 ${seconds % 60}秒`,
  }
}

export function getStats(id) {
  const stats = {
    startupTime: new Date(state.startupTime).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    }),
    uptime: formatUptime(),
    buildCount: getBuildCount(id),
    buildRecords: getBuildRecords(id),
  }
  if (!id) {
    stats.running = state.running
    stats.queue = getQueueSnapshot()
    stats.projects = PROJECT_IDS.map((pid) => ({
      project: pid,
      isBuilding: state.projects[pid].isBuilding,
      lastBuild: state.projects[pid].lastBuild,
      buildCount: getBuildCount(pid),
    }))
  }
  return stats
}
