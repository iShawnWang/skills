---
name: spug-skill
description: "【已废弃 / Deprecated】Spug 发布平台 CLI（登录、查询应用与发布配置、创建发布单、触发发布、轮询状态）。已停止维护，请改用 DSH 插件市场的 dsh-plugin-yq-release：https://github.com/iShawnWang/dsh-market"
---

> ## ⚠️ 本 Skill 已废弃（Deprecated）
>
> 本 Skill 已停止维护，代码不再更新，请不要再使用。
>
> 请改用 **DSH 插件市场**：[dsh-market](https://github.com/iShawnWang/dsh-market)
> 在其中安装 `dsh-plugin-yq-release`（一句话把分支发到测试环境：自动合并 GitLab、发布 Spug 前端或触发小程序构建，并记录每次发布）。
>
> 添加市场索引源步骤：
> 1. DSH → 插件 → 实验性插件 → 开启「自定义插件索引」
> 2. 插件 → 发现 → 管理索引源… → 粘贴索引地址：
>    - 任意地区：`https://raw.githubusercontent.com/iShawnWang/dsh-market/main/market/index.json`
>    - 中国大陆：`https://gcore.jsdelivr.net/gh/iShawnWang/dsh-market@main/market/index.json`

# Spug CLI Skill

This skill provides a zero-runtime-dependency TypeScript CLI for Spug（已废弃，见上方提示）。

## Initialization (Required Before First Action)

Before running any command for the first time, ask the user to provide:

1. Spug login `username`
2. Spug login `password`
3. Spug local deployment `ip`
4. Spug local deployment `port` (or full `base-url`)

### Persistence Mechanism
Once successfully initialized, these values are stored in a local `.env` file. **Subsequent calls do not require these parameters** unless the user wants to switch environments.

### Base URL construction rule:
- Use `--ip <ip> --port <port>` to let the CLI construct the URL.
- If the user provides a full URL, use `--base-url <url>`.
- Do not execute deployment commands until initialization fields are provided at least once.

## Commands

### First run (Initializes .env)
```bash
npx tsx src/cli.ts login --ip 1.2.3.4 --port 8080 --username admin --password 'secret'
```

### Subsequent runs (Parameters are optional)
```bash
npx tsx src/cli.ts list-envs
npx tsx src/cli.ts list-apps
npx tsx src/cli.ts list-deploys
npx tsx src/cli.ts list-versions --app api_order --env pro
npx tsx src/cli.ts create-request --app api_order --env pro --name 'release test' --branch 1.x --commit 67c137d
npx tsx src/cli.ts deploy-and-watch --app api_order --env pro --name 'release test' --branch 1.x --commit 67c137d --json
```

## Resolution Rules

- `--app` accepts app `id`, `key`, or exact `name`.
- `--env` accepts environment `id`, `key`, or exact `name`.
- `--deploy-id` can be used instead of `--app` plus `--env`.
- If `--host-ids` is omitted, the CLI uses the default `host_ids` from the deploy config.

## API Flow

1. `POST /api/account/login/`
2. `GET /api/config/environment/`
3. `GET /api/app/`
4. `GET /api/app/deploy/`
5. `GET /api/app/deploy/<deployId>/versions/`
6. `POST /api/deploy/request/ext1/`
7. `GET /api/deploy/request/`
8. `POST /api/deploy/request/<requestId>/`
9. `GET /api/deploy/request/info/?id=<requestId>`

## Notes

- Spug's create-request endpoint returns an empty `data` payload, so the CLI resolves the new `request_id` by reading `/api/deploy/request/` and matching the newest request by `deploy_id` and `name`.
- The current implementation treats statuses `1` and `2` as in-progress and `3` as success. Any other final status returns a non-zero exit code in `deploy-and-watch`.
- If your Spug instance uses different status codes or custom approval flow, update the status mapping in [src/cli.ts](/Users/shawn/spug-skill/src/cli.ts).
