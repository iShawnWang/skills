import fs from 'fs'
import path from 'path'

// 加载环境变量（与 build.mjs 保持一致的行为）
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

/**
 * 项目注册表：服务里所有项目信息的唯一来源。
 *
 * branch 与 appid 的对应关系写死在小程序仓库各自分支的 ci:dev / upload-dev.mjs 里，
 * 这里登记的是服务侧需要知道的事实（切哪条分支、显示什么名字、用哪个飞书前缀）。
 *
 * 两个项目共用同一个仓库目录（区别只在切哪条分支），所以都用 PROJECT_PATH，
 * 不需要按项目配目录。
 */
export const PROJECTS = [
  {
    id: 'YQ-QQC',
    label: '乔乔车小程序',
    aliases: ['qqc', 'mp', '乔乔车'],
    branch: 'master-mp-test',
    buildScript: 'ci:dev',
    appid: 'wx72082d541b129ee4',
    notifyPrefix: '[YQ] 乔乔车',
    webhookEnv: 'FEISHU_WEBHOOK_URL',
  },
  {
    id: 'YQ-CAR',
    label: '车辆交易市场',
    aliases: ['car', '养车'],
    branch: 'master-mp-car-test',
    buildScript: 'ci:dev',
    appid: 'wx97dd5b2518e80061',
    notifyPrefix: '[YQ] 车辆交易市场',
    webhookEnv: 'FEISHU_WEBHOOK_URL_CAR',
  },
]

export const PROJECT_IDS = PROJECTS.map((p) => p.id)

const BY_ID = new Map(PROJECTS.map((p) => [p.id, p]))

function norm(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/**
 * 把用户输入（id / 别名 / 中文名）解析成注册表条目。
 * 大小写与首尾空格不敏感；命中失败返回 null。
 * 冲突规则：先按 id 精确匹配，再按注册表顺序查别名与 label。
 */
export function resolveProject(value) {
  const key = norm(value)
  if (!key) return null
  for (const id of PROJECT_IDS) {
    if (norm(id) === key) return BY_ID.get(id)
  }
  for (const p of PROJECTS) {
    for (const alias of p.aliases || []) {
      if (norm(alias) === key) return p
    }
    if (norm(p.label) === key) return p
  }
  return null
}

export function getProject(id) {
  return BY_ID.get(id) || null
}

/**
 * 小程序仓库目录：全局唯一一个，两个项目共用。
 *
 * 只从 PROJECT_PATH 读，没有 process.cwd() 回落 —— 曾经回落到服务自己的目录，
 * 变量没配时 git checkout 在非 git 目录里只报一个没有上下文的 code 1。
 */
export function repoCwd() {
  return process.env.PROJECT_PATH || ''
}

/** 项目专属飞书 webhook，未配置则复用默认 webhook。 */
export function projectWebhook(p) {
  return process.env[p.webhookEnv] || process.env.FEISHU_WEBHOOK_URL || ''
}

/**
 * 启动时扫描别名冲突，只告警不阻断。
 * 当前两个项目没有冲突；将来加项目时能立刻发现问题。
 */
export function warnDuplicateAliases() {
  const seen = new Map()
  for (const p of PROJECTS) {
    for (const alias of [p.id, ...(p.aliases || []), p.label]) {
      const key = norm(alias)
      if (!key) continue
      const owner = seen.get(key)
      if (owner && owner !== p.id) {
        console.warn(`[projects] 别名冲突: "${alias}" 同时属于 ${owner} 与 ${p.id}，将按注册表顺序取第一个`)
      } else if (!owner) {
        seen.set(key, p.id)
      }
    }
  }
}
