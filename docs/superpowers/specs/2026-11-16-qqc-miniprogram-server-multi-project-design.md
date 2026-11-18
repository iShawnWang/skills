# qqc-miniprogram-server 支持第二个小程序（YQ-QQC / YQ-CAR）设计文档

- 日期：2026-11-16
- 状态：待批准
- 相关仓库：`/Users/qckj/skills`（服务）、`/Users/qckj/yeqiao-mobile-prods`（小程序流水线）

## 1. 为什么做

`qqc-miniprogram-server` 目前只能构建/发布**乔乔车小程序**：项目路径、分支、appid、私钥、飞书文案全部写死。现在要支持**同仓库的车辆交易市场线**（`master-mp-car-test`，appid `wx97dd5b2518e80061`），并且希望以后新增小程序时不用再改一遍服务代码。

日常使用方式是发版：把特性分支 merge 到小程序目标分支，然后触发构建 → 编译 → 用 `miniprogram-ci` 上传体验版 → 飞书通知。第二个小程序要走完全一样的流程。

**关键前提（用户已确认）**：两个小程序**共用同一份代码目录**，靠 `git checkout` 来回切分支。构建机上没有人在那个目录里写代码。

## 2. 目标 / 非目标

### 目标
- 一个服务进程同时管理两个小程序：`YQ-QQC`（乔乔车）、`YQ-CAR`（车辆交易市场）。
- 所有触发/查询接口显式带 `project` 参数；不传时**不静默回落到乔乔车**，而是返回错误并列出可选项目。
- 两个项目可以各自触发构建；构建**全局串行**执行，避免共用目录被并发 `git checkout` / `pnpm install` 打坏。
- 历史统计、构建记录、飞书通知都能区分项目，且不丢历史数据。
- 乔乔车现有用法（release-skill 的流程、MCP 工具名）不被破坏。

### 非目标
- 不做多进程/多实例部署（见方案 B，已否决）。
- 不做权限控制、按项目鉴权。
- 不改 `miniprogram-ci` 的上传策略、版本号规则、体验版/正式版语义。
- 不引入数据库；继续用内存状态 + `stat.log` / `builds.log`。
- 不做车辆交易市场线专属的业务差异（登录、支付、首页等代码差异靠分支本身承载）。

### 反目标（技术上跑通但算失败）
- 不传 `project` 时悄悄发到乔乔车 → 发错小程序。
- 两个构建同时跑同一个目录 → 分支/产物互相覆盖，产出不可信。
- 为了支持第二个项目，让乔乔车的发版流程需要改客户端配置才能继续用。
- 记录里的 commit hash 与真正上传的 commit 不一致（共用目录切分支后读 HEAD 就会这样）。

## 3. 约束与现状事实

### 服务侧（`/Users/qckj/skills/qqc-miniprogram-server/`）
- `server.mjs` 433 行：`PORT = 3000`、SSE(`/sse` + `/messages`)、8 个 MCP 工具、HTTP 路由 `/help /build /status /last-build /builds /stats /log /menu-query /health`，**全部无项目维度**；`HELP_TEXT` 写死"乔乔车小程序"。
- `build.mjs`：`loadEnv()` 手写解析 `.env`；`getLatestCommitHash()` 执行 `git rev-parse --short HEAD`（`cwd = PROJECT_PATH`）；`triggerBuild()` 执行 `spawn('pnpm', ['run', 'ci:dev'], { cwd: PROJECT_PATH })`。
- `state.mjs`：模块级单例 `{ isBuilding, lastBuild, log, startupTime, buildRecords }`；`stat.log` 上限 500 条。
- `.env`：`FEISHU_WEBHOOK_URL`、`NOTIFICATION_KEYWORD=[YQ]`、`PROJECT_PATH=/Users/qckj/work/qqc-miniprogram`。
- 依赖只有 `@modelcontextprotocol/sdk` + `express`。启动方式 `pm2 start server.mjs --name qqc-mp-server`。
- **线上实例在 `192.168.91.61:3000`**，MCP 客户端 `~/.codebuddy/mcp.json` 指向 `/sse`。本地这份是仓库副本（本地 `~/work` 不存在），`.env` 的路径应在构建机上被覆盖。这是**改了就影响线上发版**的服务。
- **本机无法触达构建机**：`~/.ssh/config` 无 `192.168.91.61` 条目，`known_hosts` 无记录，`ping` 100% 丢包，`curl -m 3 /health` 返回 000。→ 部署与重启必须由人执行（§6）。
- 三个文件都用 `process.cwd()` 定位：`state.mjs:4`（`stat.log`）、`server.mjs:14`（`builds.log`）、`build.mjs:8`（`.env`）。pm2 的启动目录决定它们落在哪里。

### 小程序仓库侧（`/Users/qckj/yeqiao-mobile-prods`）
- `package.json` 里 `ci:dev`（**当前四个分支内容完全相同**）：
  ```
  git checkout master-mp-test && touch ./src/manifest.json && echo '{}' > ./src/manifest.json && git pull && pnpm install && pnpm run build:mp:dev && node scripts/upload-dev.mjs
  ```
  → 在 YQ-CAR 分支上跑 `ci:dev` 也会切去乔乔车分支，这个必须改（§5.9）。
- `scripts/upload-dev.mjs` 写死 `appid: 'wx72082d541b129ee4'`、`privateKeyPath: ./private.wx72082d541b129ee4.key`、`projectPath: dist/build/mp-weixin`；版本号 = `package.json` 主.次 + 年内第几天。
- appid 的真正来源是 `manifest.config.ts` 的 `appid: VITE_WX_APPID`，而 `VITE_WX_APPID` 来自各分支的 `env/.env`：`master-mp-test` = `wx72082d541b129ee4`，`master-mp-car-test` = `wx97dd5b2518e80061`。
- `src/manifest.json` 被 `.gitignore` 忽略，由 `@uni-helper/vite-plugin-uni-manifest` 在构建时**从 `manifest.config.ts` + `env/.env` 重新生成**（插件 `setup()` 里无条件 `WriteManifestJSON`）。因此 `ci:dev` 里 `echo '{}' > src/manifest.json` 只是历史遗留的"保证文件存在"，会被覆盖。**现有行为保持不动。**
- car 家族的 2 个分支（`master-mp-car`、`master-mp-car-test`）上 `ci:dev` 仍指向 `master-mp-test`、`upload-dev.mjs` 仍是乔乔车 appid，需改。
- 已跟踪的私钥只有 `scripts/private.wx72082d541b129ee4.key`（乔乔车）。YQ-CAR（车辆交易市场小程序）的私钥已在 `/Users/qckj/Downloads/private.wx97dd5b2518e80061.key`（1675 字节，`-----BEGIN RSA PRIVATE KEY-----`，与乔乔车同格式），**尚未进仓库**。
- 仓库 1.1G / `node_modules` 560M；`pnpm install` 每次构建都跑。
- 两分支 `package.json` 唯一差异（实测 `git diff master-mp-test master-mp-car-test -- package.json`）：`"circular-json": "^0.5.9"` 只在 `master-mp-test`，lockfile 差 9 行。这不是本次要解决的，但决定了"两个分支提交相同改动"不会得到相同 commit（§5.10）。

## 4. 可选方案与选择

### 方案 A：单进程 + 项目注册表（并发构建）
一个进程，注册表里放两个项目，不同项目可以并发构建。
- ✅ 代码改动最小。
- ❌ 共用同一份代码目录时**不可能安全并发**：两个 `git checkout` / `pnpm install` / `uni build` 会互相踩，产出不可信。为并发就得引 worktree 或双目录，是把问题做大。

### 方案 B：pm2 起两个进程，各管一个项目
- ✅ 进程级隔离，一个项目构建不影响另一个的接口响应。
- ❌ 共用目录下两个进程仍然会同时 checkout/构建，冲突问题没解决；端口、飞书、统计文件都要分裂（`stat.log` 会被两个进程写）；两个实例的健康状态要分别监控。

### 方案 C：单进程 + 项目注册表 + 全局串行队列 ✅（用户选择）
一个进程、一份注册表；同一时刻只跑一个构建，跨项目排队。
- ✅ 共用目录天然安全：串行 = 不会有第二次 checkout 插进来。
- ✅ 统计、日志、飞书、MCP 都只在现有结构上加一维。
- ✅ 日常发版是低频人工操作，排队几乎感知不到。
- ❌ 一个项目的构建（约数分钟）会让另一个项目的触发进入等待——可接受，且接口会返回排队位置。

**选 C 的理由**：约束是"共用一份代码来回切"，那么"同一时刻只有一次构建"就是唯一安全模型；注册表保证加第三个小程序时只改数据、不改逻辑。

## 5. 设计

### 5.1 项目注册表 `projects.mjs`（新增）

单一事实来源，服务所有地方的项目信息都从这里取。

```js
{
  id: 'YQ-QQC',                       // 用户指定，接口传参用它（大小写不敏感）
  label: '乔乔车小程序',
  aliases: ['qqc', 'mp', '乔乔车'],
  branch: 'master-mp-test',
  buildScript: 'ci:dev',              // → pnpm run ci:dev
  appid: 'wx72082d541b129ee4',
  notifyPrefix: '[YQ] 乔乔车',
  webhookEnv: 'FEISHU_WEBHOOK_URL',   // 未配置则复用默认 webhook
}
```

`YQ-CAR`：`label 车辆交易市场`、`aliases ['car','养车']`、`branch master-mp-car-test`、`buildScript ci:dev`、`appid wx97dd5b2518e80061`、`notifyPrefix '[YQ] 车辆交易市场'`、`webhookEnv FEISHU_WEBHOOK_URL_CAR`。

**两个项目的 `buildScript` 都是 `ci:dev`** —— 脚本名不区分项目，区分靠的是先 checkout 到各自 `branch`（§5.10）。注册表里保留 `buildScript` 字段只是为了将来某个项目真需要不同命令时有地方放，现在两项同值。

**两项目共用同一个仓库目录，所以只有一个 `PROJECT_PATH`**，注册表里不按项目登记目录，导出的是全局 `repoCwd()`。理由：两条线是同一个 uni-app 仓库的不同分支，本来就没有"第二个目录"这个东西；按项目配变量只会让人以为可以拆开、然后在只配一个时期待静默回落。**不做 `project.cwdEnv`、不做 `process.cwd()` 回落** —— 曾经回落到服务自己的目录，变量没配时 `git checkout` 在一个非 git 目录里只报一个没有上下文的 `code 1`。

导出：`PROJECTS`、`PROJECT_IDS`、`resolveProject(value)`（id / alias / 中文 label，大小写与首尾空格不敏感，命中失败返回 `null`）、`repoCwd()`、`projectWebhook(p)`。

**启动自检**：`checkProjectEnvironment()` 在服务启动时与每次构建前各跑一次，检查 `PROJECT_PATH` 已配置、目录存在、目录里有 `.git`。启动时把结果打出来，配置错了当场可见；构建前再查一次，不通过则 `triggerBuild` 直接返回 `{invalid}`，**不占位、不入队、不写构建记录**，HTTP 侧回 500 + 可照做的修复提示。

**冲突规则**：id 必须全局唯一；alias / label 命中原表的多值时**先匹配 id，再按注册表顺序取第一个**，并在**进程启动时**扫描一遍别名表，发现重复就打印警告（不阻断启动）。当前两个项目没有别名冲突。

**`enum` 只列 id**：MCP 的 `project` 参数 enum 取 `PROJECT_IDS`（`["YQ-QQC","YQ-CAR"]`），别名与中文 label 只作为 HTTP 侧的宽松输入。理由是 enum 是给 AI 看的最小集合，列全部别名既噪声大，也会与 `resolveProject` 各自演化而产生漂移。

### 5.2 状态 `state.mjs`（改造）

单例 → 按项目分组，但**统计文件不拆**：

```js
state = {
  projects: {
    'YQ-QQC': { isBuilding: false, lastBuild: { commitHash, timestamp }, log: '' },
    'YQ-CAR': { ... },
  },
  queue: [],        // [{ project, ip, source, requestedAt, requestedCommit }]
  running: null,    // 当前正在跑的 project id
  startupTime, buildRecords: [],
}
```

- 现有导出函数改为带 `projectId` 参数：`setBuilding(id, status)`、`setLastBuild(id, commitHash)`、`clearLog(id)`、`appendLog(id, data)`、`getProjectState(id)`。
- `stat.log` / `builds.log` **保持单文件**，每条记录加 `project` 字段，值为 **id**（`YQ-QQC`），不是中文 label —— 与接口参数同一套词汇，避免同一个东西两种写法。
- 老记录（无 `project` 字段）**不做文件回写**，只在加载时内存归一为 `YQ-QQC`。因此任何按项目过滤的地方，匹配条件必须是 `record.project === id || record.project === undefined`，否则老的 13 条乔乔车历史会从 `?project=YQ-QQC` 的结果里消失（数据还在、但看不见）。
- `buildRecords` 全局按时间倒序，查询时按上面这条规则过滤。
- **`stat.log` / `builds.log` / `.env` 都用 `process.cwd()` 解析**（`state.mjs:4`、`server.mjs:14`、`build.mjs:8`）。构建机上 pm2 的启动目录必须与现在一致，否则新进程会在别的目录新建空日志，看起来像"历史记录丢了"。上线前后各确认一次 `pm2 describe qqc-mp-server | grep -i cwd`。

### 5.3 串行队列（`build.mjs` 改造）

规则：

| 情况 | 结果 |
|---|---|
| 空闲，触发任意项目 | 立刻开始构建（202 `{started:true}`） |
| 另一项目正在构建，触发本项目 | 入队，202 `{queued:true, position:n}` |
| **同一项目**正在构建或已在该项目队列里 | 409（与现状一致，防重复触发） |
| 队列长度 ≥ 10 | 429，提示稍后再试 |

- 队首结束（成功或失败）后自动启动下一个，并照常推送飞书。
- **任何一步失败都出队并继续**：`git checkout` 失败、`git pull` 失败（脏工作区）、`pnpm install` 失败、编译失败、上传失败，一律视为"这一次构建结束"，弹出队首、写失败记录、推飞书、启动下一个。队列绝不能因为一次失败而卡住两个项目。失败通知里附带当前仍在排队的项目。
- 入队时记录 `ip / source / requestedAt / requestedCommit`，**在真正开始构建时才写 `builds.log` 和 `stat.log`**，这样记录里的时间与 commit 就是实际构建的那一次。
- `requestedCommit` 用分支引用（见 5.4）在触发时取；开始构建时**不再重取**，避免与"用户触发时刻看到的分支"不一致。**入队前不做 `git fetch`** —— 分支 ref 反映的是"上一次构建 pull 到的状态"，这是可接受的近似；真正的远端状态以 `ci:dev` 里的 `git pull` 为准，构建结束后再取一次拿到的是实际被上传的 commit（见下一条）。`requestedCommit` 在 `/builds` 里标注为"触发时本地分支"，不要用"远端最新"来描述它。
- **先占位、再取 hash**：`triggerBuild` 必须先把本次构建放进 `running` 或 `queue`，之后才 `await` 取 commit。若先 await 再占位，两个项目几乎同时触发时会双双通过 `isProjectBusy` 检查、一起开跑，在共用目录上互相踩。实测并发触发已验证：第二次触发得到 `queued` 而不是 `started`。
- 构建成功的 `lastBuild.commitHash` 在构建结束后重新取一次分支 ref —— 此时 `git pull` 已发生，拿到的是真正被上传的 commit。
- 队列上限 10 在只有两个项目、且同项目重复触发会 409 时**实际不可达**（队列最多 1 项）。保留这个判断做防御（例如将来注册第三个项目、或加了并发入口），但**不进验收标准**，不写测试——它是纯防御分支。

**每次构建的执行顺序（方案乙，见 §5.10）**：

1. `git checkout <project.branch>`（cwd = `repoCwd()`）—— 由服务执行，失败即本次构建失败。
2. `pnpm run <project.buildScript>`（cwd 同上）—— 现在两个项目都是 `ci:dev`。**必须在第 1 步之后**，否则脚本名会从「当前目录所在分支」的 `package.json` 解析。

两步都完整记录到 `builds.log` / `/log`，失败通知里带上失败发生在哪一步。

### 5.4 `getLatestCommitHash()` 修正（必须）

现在读 `HEAD`，共用目录切分支后会读到另一个项目的 HEAD。改为读**分支引用**：

```
git rev-parse --short <ref>     // cwd = repoCwd()
```

`<ref>` 按 `refs/heads/<project.branch>` → `refs/remotes/origin/<project.branch>` 顺序解析，先命中先用（`findBranchRef`）。

**为什么不能只看 `refs/heads/`**：构建机可能只在这个目录里 checkout 过乔乔车那条线，车辆交易市场的分支只以远端跟踪引用 `refs/remotes/origin/master-mp-car-test` 的形式存在。只看本地引用会把它误判成"分支不存在"，实测已踩（报错 `分支 master-mp-car-test 不存在`，而远端明明有）。

构建前的环境自检用 `ensureBranchAvailable()`：两种引用都找不到时，主动 `git fetch origin <branch>` 一次再找；仍找不到才失败，报错里带上 `git fetch` 的原始输出（`fatal: couldn't find remote ref ...`），便于区分"分支名写错"与"没权限"。

### 5.5 HTTP 接口

| 接口 | 变更 |
|---|---|
| `POST/GET /build` | **需要** `project` |
| `GET /status` | **需要** `project` |
| `GET /log` | **需要** `project` |
| `GET /last-build` | **需要** `project` |
| `GET /builds` | `project` 可选（纯文本日志，按项目过滤行） |
| `GET /stats` | `project` 可选（不给则返回全部 + 每项目汇总） |
| `GET /projects` | **新增**：注册表 + 各项目 `isBuilding` + 队列状态 |
| `GET /help` `/health` `/` `/menu-query` | 不变（与项目无关；`/health` 不能要求参数，监控在用） |

缺 `project` 时返回 400：

```json
{
  "error": "missing required query parameter: project",
  "message": "请指定 project，可选值: YQ-QQC, YQ-CAR",
  "available": ["YQ-QQC", "YQ-CAR"],
  "hint": "GET /projects 可查看项目详情"
}
```

传了非法值同样是 400，`message` 里给出可选值。

**注意 `/build` 的 GET 与 POST 共用同一个 handler**（`server.mjs:358-359` 附近），缺参数校验要写在共享 handler 里，只写在 POST 分支会让 `GET /build` 漏掉。

`/status?project=YQ-QQC` 返回：

```json
{ "project": "YQ-QQC", "label": "乔乔车小程序", "isBuilding": true,
  "running": "YQ-QQC", "queued": [], "queueLength": 0 }
```

排队中时 `isBuilding` 为 `false`，但要让调用方能看出"我排在第几"：

```json
{ "project": "YQ-QQC", "label": "乔乔车小程序", "isBuilding": false,
  "queuePosition": 1, "running": "YQ-CAR", "queueLength": 1 }
```

`queuePosition` 为 `null` 表示不在队列里。

`/projects` 返回：

```json
{ "projects": [ { "id": "YQ-QQC", "label": "乔乔车小程序", "branch": "master-mp-test",
                  "appid": "wx72082d541b129ee4", "isBuilding": false,
                  "lastBuild": { "commitHash": "...", "timestamp": "..." } }, ... ],
  "running": "YQ-CAR", "queue": [ { "project": "YQ-QQC", "position": 1 } ] }
```

**不给 project 的 `/stats`、`/builds` 不算静默回落**：它们返回的是全部项目的聚合数据，每条记录自带 `project`。

### 5.6 MCP 工具

工具名全部不变；新增一个 `list_projects`。

- `trigger_build`、`get_build_status`、`get_build_log`、`get_last_build_info`：`project` **必填**，`enum: ["YQ-QQC","YQ-CAR"]`（由注册表生成），描述里说明每个 id 对应哪个小程序。
- `get_stats`、`builds` 类查询：`project` 选填。
- `get_help`、`health_check`、`query_admin_menu`、`list_projects`：无 `project`。
- 必填但未传时返回 `isError: true`，文案里列出可选值（与 HTTP 对齐），不默认乔乔车。

**`trigger_build` 的三种返回值必须能区分**（现在只有"开始"和"已在构建"两种）：

| 情况 | MCP 返回 |
|---|---|
| 立刻开始 | `isError` 缺省，文本 "Build started for YQ-CAR (master-mp-car-test). Poll get_build_status…" |
| 已入队 | `isError` 缺省，文本 "Queued for YQ-CAR at position 1 (another project is building). Poll get_build_status…" |
| 同项目已在构建/已在队列 | `isError: true`，"A build for YQ-CAR is already in progress." |

**必须同时改 `trigger_build` 的工具描述**：现在写的是"每隔 20 秒通过 `get_build_status` 轮询…直到 `isBuilding` 变为 false"。排队场景下该项目的 `isBuilding` 在轮到自己之前一直是 `false`，照旧描述轮询的 AI 会立刻误判"已经构建完了"。改为"轮询 `get_build_status`，直到返回 `isBuilding === false` **且** `queuePosition === null`"。

现有 MCP 客户端（`~/.codebuddy/mcp.json` → `http://192.168.91.61:3000/sse`）工具名不变，但调用时必须带 `project`；AI 从工具 schema 的 enum 里就能看到可选值。

### 5.7 飞书通知

文案前缀取项目：

```
[YQ] 乔乔车 构建发布成功
[YQ] 车辆交易市场 构建发布成功
```

项目可用 `FEISHU_WEBHOOK_URL_CAR` 指向另一个群；未配置则复用默认 webhook。启动通知改为列出所有已加载项目。

### 5.8 帮助文档 `HELP_TEXT`

重写为双项目版：先说明"所有构建接口必须带 `project`"，给出 `YQ-QQC` / `YQ-CAR` 对照表（小程序名、分支、appid、构建命令），再给接口表与 curl 示例（含 `/projects`），并说明排队语义。

### 5.9 小程序仓库改造

**核心不变式：`pnpm run ci:dev` 构建「当前所在分支所属的那个小程序」。脚本名不变，不新增 `ci:car`，也不引入命令行参数。**

两条线各自写死自己的 appid / 私钥 / 目标分支，互不引用：

| 分支 | `ci:dev` 里的 checkout 目标 | `upload-dev.mjs` 的 appid / 私钥 | 本次是否要改 |
|---|---|---|---|
| `master-mp` / `master-mp-test` | `master-mp-test` | `wx72082d541b129ee4` | **不改**（现状已经正确） |
| `master-mp-car` / `master-mp-car-test` | `master-mp-car-test` | `wx97dd5b2518e80061` | **要改**（现在还是乔乔车的） |

- **只改 car 家族的 2 个分支**：`master-mp-car`、`master-mp-car-test`，各改 2 行（`package.json` 的 `ci:dev` 一行 + `scripts/upload-dev.mjs` 里的 `appid`/`privateKeyPath` 两处）。qqc 家族**一行都不动**，其余 90+ 分支继续跑旧内联命令，行为完全不变。
- `master-mp-car` 与 `master-mp-car-test` 改完内容**逐字节相同**（两者本来就在同一个 commit `6eda97e48`）；`master-mp` 与 `master-mp-test` 保持逐字节相同。全世界仍然只有 2 种行内容。
- `master-mp`（非 test）仍指向 `master-mp-test`、`master-mp-car` 指向 `master-mp-car-test`，与今天「在任意分支跑 ci:dev 都会切到该家族的测试分支」一致，手工跑不会改变落点。
- **为什么不要入参**：两条线是长期并存、各自独立的，appid 与分支是**绑定关系**而不是**每次调用的选择**。写死在分支里，改一次永久生效，任何人手动 `pnpm run ci:dev` 的结果都对；引入 `--appid` 反而制造「参数与分支不匹配」这一整类错误和对应的校验代码。
- 私钥按 `scripts/private.<appid>.key` 命名（car 分支写死 `private.wx97dd5b2518e80061.key`），不新增 appid 校验逻辑：分支与 appid 的对应关系已经写在同一行代码里，不存在运行时错配的可能。

**改完后的 car 分支 `ci:dev`**：

```
git checkout master-mp-car-test && touch ./src/manifest.json && echo '{}' > ./src/manifest.json && git pull && pnpm install && pnpm run build:mp:dev && node scripts/upload-dev.mjs
```

与原来唯一的差别是 `checkout` 的目标分支。

### 5.10 为什么服务必须自己先 checkout（方案乙）

`pnpm run <script>` 的**脚本名在执行 checkout 之前**就从当时目录的 `package.json` 解析。如果构建机停在一条指向别的小程序的分支上，`pnpm run ci:dev` 会先跑这份 package.json 里的 `ci:dev`，也就是它自己硬编码的那个 checkout 目标 —— 结果就是「服务想构建 YQ-CAR，实际构建了 YQ-QQC」。

所以服务侧的动作顺序固定为：

1. `git checkout <project.branch>`（cwd = `repoCwd()`）
2. `pnpm run ci:dev`（cwd 同上）

这样第 1 步先把目录切到目标项目家族的分支，第 2 步读到的 `package.json` 必然是该项目自己那份写死 appid 的版本，「读哪份 `package.json`」与「要构建哪个项目」严格一致。服务侧完全不依赖构建机当前停在哪个分支。第 1 步失败 → 该次构建按失败出队（§5.3），不再执行第 2 步。

**副作用（可接受）**：checkout 后 `ci:dev` 里的 `git pull` 若更新了这一行，本次仍执行 pull 之前的版本，下一次构建才生效。

**两分支 `package.json` 已有一处无关分歧**（`git diff master-mp-test master-mp-car-test -- package.json` 实测）：

```
-    "circular-json": "^0.5.9",     // 只在 master-mp-test 有
```

所以"两个分支提交相同改动"不可能产生相同的 commit，lockfile 也差 9 行。约定：

- 以 **`master-mp-test`（乔乔车）为主干**，YQ-CAR 分支作为长期分支；日常发布不动这行依赖。
- 本次改动**不顺手合并这处分歧**（超出范围，且会牵动 lockfile 与安装结果）。它作为已知的潜在冲突留在那里。
- 若下一次两分支互 merge 在 `package.json` 上冲突，按 release-skill 的既有规则**停下来交给人**，不自动解决。


### 5.11 YQ-CAR 私钥

- `scripts/private.wx97dd5b2518e80061.key` 已复制进仓库并**提交到 git**（commit `0ca7ef7ab chore: pk`，由用户本人提交并确认），与乔乔车那份 `private.wx72082d541b129ee4.key` 的处理方式一致 —— 那份也是入库的。
- 因此构建机上**不需要任何手工复制步骤**：`git pull` 到 car 分支就自动拿到私钥。全新 clone 同样开箱可用。
- 提交进 git 意味着密钥随仓库分发到所有能 clone 的人手上。这与仓库既有做法一致（乔乔车私钥自 `caff85103 chore: sync upload cli` 起就在库里），本次不做额外处理。

## 6. 上线顺序（不能颠倒）

**部署链路（本机已验证）**：`192.168.91.61` 在 `~/.ssh/config` 里**没有**条目，`~/.ssh/known_hosts` 也没有该主机，`ping` 100% 丢包（`curl -m 3 /health` 返回 000）。同一台机器上唯一的引用是 `~/.codebuddy/mcp.json`。

结论：**本机无法直接部署或重启构建机**，以下步骤中凡是"在构建机上"的动作，**都需要人去做，或至少由人提供 SSH 入口**。实施计划里不能写成"推送并重启"，只能产出"可直接拷走的文件 + 一段照抄即可的命令清单"。

1. **仓库侧（可在本机做）**：只改 car 家族的 2 个分支 —— `master-mp-car`、`master-mp-car-test`，各改 `package.json` 的 `ci:dev` 一行 + `scripts/upload-dev.mjs` 的 appid/私钥两处；qqc 家族不动。push 到 `172.17.188.125`。
2. **构建机**：`git fetch` 后把 `master-mp-car` / `master-mp-car-test` 更新到最新（私钥已在仓库里，随 pull 一起下来，无需手工复制）。
3. **验证仓库侧（构建机上，人工）**：在 `master-mp-car-test` 上手动 `pnpm run ci:dev` 跑通一次（会真实上传一个车辆交易市场体验版），再 `git checkout master-mp-test && pnpm run ci:dev` 确认乔乔车没坏。
4. **服务侧（可在本机做文件，部署需人）**：产出新的 `server.mjs / build.mjs / state.mjs / projects.mjs`，交给能登录 192.168.91.61 的人覆盖、`pm2 restart qqc-mp-server`。`.env` **不需要改** —— 两个项目共用已有的 `PROJECT_PATH`（可选新增 `FEISHU_WEBHOOK_URL_CAR` 给车辆交易市场单独建群）。
   - 重启前确认 `pm2 describe qqc-mp-server` 的 **cwd**，新的 `.env` 必须放在那个目录（见 5.2）。
   - 重启前确认没有构建在跑（队列与 `running` 只在内存）。
5. **验证服务侧**：`GET /projects` → `GET /status?project=YQ-CAR` → `POST /build?project=YQ-CAR`。

先改仓库再改服务：否则服务 checkout 到 car 分支后，读到的是还指向 `master-mp-test` 的 `ci:dev`，构建出来的仍是乔乔车。
先验证仓库再发服务：否则线上会出现"触发成功但构建必败"。

> 注：`~/.codebuddy/mcp.json` 里的 `192.168.91.61` 与 release-skill memory 里出现过的 `10.10.111.188` / `192.168.91.130` 说明这台构建机地址历史上变过几次。部署前先确认当前地址仍然有效，不要照着旧记录找机器。


## 7. 风险

| 风险 | 缓解 |
|---|---|
| 改接口参数影响正在用的发版流程 | 工具名不变、参数名与 enum 明确；上线前用 `/projects`、`/status` 验证；缺参数时报错信息会告诉调用方该传什么 |
| 构建机当前分支不确定 | 服务在跑 `ci:dev` 前**自己先 checkout** 到目标分支（§5.10），脚本名与分支严格一致 |
| 共用目录被人工改动 | `git checkout` 失败会体现在日志和飞书失败通知里，不会静默出错版本；失败后出队继续，不卡队列 |
| 上一版构建中断（进程重启） | 队列与 `running` 只在内存；重启后丢失，但 `stat.log`/`builds.log` 保留。文档说明：重启需人工确认无构建在跑 |
| 版本号同日重复 | 版本号 = 主.次 + 年内第几天，两 appid 相互独立；同一小程序同日多次构建版本号相同，与现状一致 |
| 密钥泄露风险 | 两把私钥都在 git 里（与仓库既有做法一致，用户已确认）。能 clone 仓库即可拿到，属已知接受项 |
| **本机无法部署到构建机** | 见 §6：`192.168.91.61` 无 SSH 配置、ping 不通。只交付文件与命令清单，部署与重启由人执行 |
| **pm2 cwd 变了导致"历史丢了"** | 上线前后核 `pm2 describe` 的 cwd；`.env` 必须落在同一个目录 |
| **排队中的 AI 误判构建已完成** | `trigger_build` 描述改为"`isBuilding === false` 且 `queuePosition === null`"，`/status` 增加 `queuePosition` |
| **老记录从按项目查询里消失** | 过滤条件统一为 `project === id \|\| project === undefined` |
| **两分支 `package.json` 的 `circular-json` 分歧** | 本次不处理；未来 merge 冲突时停下交给人（release-skill 既有规则） |
| **car 分支的 `ci:dev` / `upload-dev.mjs` 改漏** | 改漏的表现是该分支仍走旧的内联命令 + 乔乔车 appid，构建会「成功」但发的是错的小程序；上线核对时逐分支 `git show <b>:package.json \| grep ci:dev` 与 `git show <b>:scripts/upload-dev.mjs \| grep appid` |


## 8. 待实现的清单（给 builder 的边界）

- 服务侧 4 个文件：`projects.mjs`（新增）、`state.mjs`（改造）、`build.mjs`（改造）、`server.mjs`（接口 + MCP + HELP_TEXT）。
- 仓库侧 2 个文件、2 个分支：`scripts/upload-dev.mjs`（appid + 私钥两处）、`package.json` 的 `ci:dev` 一行，**只改 `master-mp-car` 与 `master-mp-car-test`**（两者内容相同）。`master-mp` / `master-mp-test` 一行不改，其余分支一律不动。
- README（服务侧）更新接口表与环境变量说明。
- 一份**交接清单**（构建机上要执行的命令、要复制的私钥、要改的 `.env` 键、`pm2` 重启与验证命令），因为本机登不上构建机（§6）。放服务侧 README 的"部署"一节即可，不另立文件。
- 无新增 npm 依赖。

### 留给 builder 的决定（不影响做什么）
- 各文件内部函数拆分方式与日志文案细节。
- `/builds` 返回文本的过滤行格式。
- 是否给队列加一个 `GET /queue`（默认不加，避免接口膨胀；信息已并入 `/status` 和 `/projects`）。队列上限 10 的 429 文案同理（防御分支，不测）。

## 9. 验收标准

1. `GET /projects` 返回 `YQ-QQC`、`YQ-CAR` 两项及各自状态。
2. `GET /status`、`GET /build` 不带 `project` → 400，body 里同时有错误说明与可选值列表。
3. `GET /status?project=YQ-CAR` 返回车辆交易市场的状态；`?project=car` 等别名也能命中。
4. `POST /build?project=YQ-CAR` 在构建机切到 `master-mp-car-test`、编译、用 `wx97dd5b2518e80061` 的 key 上传成功；飞书前缀为 [YQ] 车辆交易市场。
5. YQ-CAR 构建进行中触发 `POST /build?project=YQ-QQC` → 202 且返回排队位置；两个都结束后 `stat.log` 有两条带 `project` 的记录。
6. 同一项目重复触发 → 409。
7. 构建成功后 `/last-build?project=YQ-CAR` 的 commit 与 YQ-CAR 分支 `git rev-parse --short master-mp-car-test` 一致。
8. 在 `master-mp-test` 与 `master-mp-car-test` 上分别跑 `pnpm run ci:dev`，各自构建出**本分支 appid** 对应的小程序（乔乔车 / 车辆交易市场），互不串台；`master-mp`、`master-mp-car` 上跑则落到各自 test 分支，结果同上。
9. 老的 `stat.log` 历史记录在 `/stats` 里仍可见，归入 `YQ-QQC`；`/stats?project=YQ-QQC` 也能看到它们。
10. 排队期间 `GET /status?project=<排队中的项目>` 返回 `isBuilding:false` 且 `queuePosition:1`。
11. 队列中的构建在 `git checkout` 失败（例如手工弄脏工作区）时：写失败记录、推飞书、**队列继续**，另一个项目能正常触发完成。
12. 服务重启后 `.env` 与 `stat.log` 仍是重启前那个目录（`pm2 describe` 的 cwd 未变），历史记录数不减少。
13. `git show master-mp-car-test:scripts/upload-dev.mjs | grep -c wx97dd5b2518e80061` 与 `git show master-mp-car-test:package.json | grep -c master-mp-car-test` 都非零，且 `master-mp-test` 对应位置仍是乔乔车 appid 与 `master-mp-test`。

