# spug-skill

通过 TypeScript 编写的 Spug CLI / skill，零运行时依赖，使用 `npx tsx` 或 `pnpm exec tsx` 直接执行。

当前支持的核心链路：

- 用户名密码登录 Spug
- 查询环境列表
- 查询应用列表
- 查询发布配置
- 查询指定发布配置的分支 / 版本
- 创建发布申请
- 自动触发发布
- 轮询发布状态

## 初始化信息（首次使用先确认）

在执行任何命令前，先准备以下信息：

- Spug 登录用户名
- Spug 登录密码
- Spug 本地部署 IP
- Spug 本地部署端口

若用户只提供了 IP 和端口，可按以下规则拼接 `--base-url`：

- 默认使用 `http://<ip>:<port>`
- 端口为 `443` 时，优先使用 `https://<ip>`（除非用户明确要求 HTTP）
- 若用户已提供完整 `http://` 或 `https://` 地址，则直接使用

## 运行前提

- Node `20+`
- pnpm `7+`

安装开发依赖：

```bash
pnpm install
```

类型检查：

```bash
pnpm exec tsc --noEmit
```

## 命令入口

```bash
pnpm exec tsx src/cli.ts <command> --base-url <url> --username <user> --password <password> [flags]
```

也可以直接用：

```bash
npx tsx src/cli.ts <command> --base-url <url> --username <user> --password <password> [flags]
```

## 支持命令

### 1. 登录连通性检查

```bash
pnpm exec tsx src/cli.ts login \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc'
```

### 2. 查询环境

```bash
pnpm exec tsx src/cli.ts list-envs \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --json
```

### 3. 查询应用

```bash
pnpm exec tsx src/cli.ts list-apps \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --json
```

### 4. 查询发布配置

```bash
pnpm exec tsx src/cli.ts list-deploys \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --json
```

按应用 ID 过滤：

```bash
pnpm exec tsx src/cli.ts list-deploys \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --app-id 1 \
  --json
```

### 5. 查询分支 / 版本

按应用和环境解析发布配置：

```bash
pnpm exec tsx src/cli.ts list-versions \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --app api_order \
  --env pro \
  --json
```

也可以直接指定 `deploy-id`：

```bash
pnpm exec tsx src/cli.ts list-versions \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --deploy-id 2 \
  --json
```

### 6. 创建发布申请

分支发布：

```bash
pnpm exec tsx src/cli.ts create-request \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --app api_order \
  --env pro \
  --name 'release test' \
  --branch 1.x \
  --commit 67c137da9ea1bc451bfa1c34ebfb35c4821825c2 \
  --json
```

直接指定发布配置：

```bash
pnpm exec tsx src/cli.ts create-request \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --deploy-id 2 \
  --host-ids 1 \
  --name 'release test' \
  --branch 1.x \
  --commit 67c137da9ea1bc451bfa1c34ebfb35c4821825c2 \
  --json
```

### 7. 触发发布

```bash
pnpm exec tsx src/cli.ts deploy \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --request-id 10 \
  --json
```

### 8. 查询发布状态

```bash
pnpm exec tsx src/cli.ts status \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --request-id 10 \
  --json
```

### 9. 一条龙发布并轮询结果

```bash
pnpm exec tsx src/cli.ts deploy-and-watch \
  --base-url https://demo.spug.cc \
  --username admin \
  --password 'spug.cc' \
  --app api_order \
  --env pro \
  --name 'codex-cli-run' \
  --branch 1.x \
  --commit 67c137da9ea1bc451bfa1c34ebfb35c4821825c2 \
  --poll-interval 5 \
  --timeout 120 \
  --json
```

## 参数说明

公共参数：

- `--base-url`：Spug 地址，例如 `https://demo.spug.cc`
- `--username`：登录账号
- `--password`：登录密码
- `--json`：JSON 输出

定位发布目标：

- `--app`：应用 `id`、`key` 或精确 `name`
- `--env`：环境 `id`、`key` 或精确 `name`
- `--deploy-id`：直接指定发布配置 ID

发布版本参数：

- `--branch <name> --commit <sha>`
- `--tag <name> --commit <sha>`
- `--version-kind <kind> --version-name <name> --version-value <value>`

其它参数：

- `--name`：发布申请标题
- `--host-id`：单个主机 ID，可重复传
- `--host-ids`：逗号分隔主机 ID，例如 `1,2,3`
- `--request-id`：发布申请 ID
- `--mode`：发布模式，默认 `all`
- `--poll-interval`：轮询间隔秒数，默认 `5`
- `--timeout`：超时秒数，默认 `600`

## 解析规则

- 未传 `--host-id` 或 `--host-ids` 时，默认使用发布配置里的 `host_ids`
- `--deploy-id` 和 `--app + --env` 二选一
- `--branch` 和 `--commit` 必须一起传
- `--tag` 和 `--commit` 必须一起传
- `--version-kind`、`--version-name`、`--version-value` 必须一起传

## 当前实现细节

请求链路：

1. `POST /api/account/login/`
2. `GET /api/config/environment/`
3. `GET /api/app/`
4. `GET /api/app/deploy/`
5. `GET /api/app/deploy/<deployId>/versions/`
6. `POST /api/deploy/request/ext1/`
7. `GET /api/deploy/request/`
8. `POST /api/deploy/request/<requestId>/`
9. `GET /api/deploy/request/info/?id=<requestId>`

注意事项：

- `create-request` 接口返回的 `data` 为空，所以当前实现会回查 `/api/deploy/request/`，用 `deploy_id + name` 匹配最新一条申请单作为本次创建结果
- `deploy-and-watch` 当前把状态 `1`、`2` 视为进行中，把状态 `3` 视为成功，其它状态视为失败并返回非零退出码
- HTTP 层使用 Node 20 的原生 `fetch`

## 文件结构

主要文件：

- [src/cli.ts](/Users/shawn/spug-skill/src/cli.ts)：CLI 入口与参数解析
- [src/spug-client.ts](/Users/shawn/spug-skill/src/spug-client.ts)：Spug API 封装
- [src/http.ts](/Users/shawn/spug-skill/src/http.ts)：HTTP 请求封装
- [src/types.ts](/Users/shawn/spug-skill/src/types.ts)：类型定义
- [SKILL.md](/Users/shawn/spug-skill/SKILL.md)：skill 说明
