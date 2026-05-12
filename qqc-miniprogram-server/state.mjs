export const state = {
  isBuilding: false,
  lastBuild: {
    commitHash: null,
    timestamp: null,
  },
  log: '',
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
