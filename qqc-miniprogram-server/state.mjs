import fs from 'fs'
import path from 'path'

const STATS_FILE = path.join(process.cwd(), 'stat.log')
const MAX_RECORDS = 500

export const state = {
  isBuilding: false,
  lastBuild: {
    commitHash: null,
    timestamp: null,
  },
  log: '',
  startupTime: Date.now(),
  buildRecords: [],
}

export function setBuilding(status) {
  state.isBuilding = status
}

export function setLastBuild(commitHash) {
  state.lastBuild.commitHash = commitHash
  state.lastBuild.timestamp = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
}

export function clearLog() {
  state.log = ''
}

export function appendLog(data) {
  state.log += data
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
        records.push(r)
      } catch (_) {}
    }
    state.buildRecords = records
  } catch (e) {
    console.error(`[state] Failed to load ${STATS_FILE}:`, e.message)
  }
}

export function addBuildRecord(record) {
  state.buildRecords.unshift(record)
  if (state.buildRecords.length > MAX_RECORDS) {
    state.buildRecords.pop()
  }
  try {
    fs.appendFileSync(STATS_FILE, JSON.stringify(record) + '\n')
  } catch (e) {
    console.error(`[state] Failed to append to ${STATS_FILE}:`, e.message)
  }
}

export function getUptimeMs() {
  return Date.now() - state.startupTime
}

export function getBuildCount() {
  return state.buildRecords.length
}

export function getBuildRecords() {
  return state.buildRecords.slice()
}

export function getStats() {
  const uptimeMs = getUptimeMs()
  const seconds = Math.floor(uptimeMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  return {
    startupTime: new Date(state.startupTime).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    }),
    uptime: {
      ms: uptimeMs,
      human: `${days}天 ${hours % 24}小时 ${minutes % 60}分 ${seconds % 60}秒`,
    },
    buildCount: getBuildCount(),
    buildRecords: getBuildRecords(),
  }
}
