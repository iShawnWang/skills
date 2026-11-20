---
name: release-skill
description: |
  【已废弃】用于软件发版的编排 Skill（协调 GitLab 分支合并、Spug 发布、小程序发布）。
  已停止维护，请改用 DSH 插件市场的 dsh-plugin-yq-release：https://github.com/iShawnWang/dsh-market
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

# Release Skill

## ⚠️ 重要提示：合并冲突禁止 AI 自行处理

**这是本 Skill 的最高优先级规则之一，违反此规则会导致严重问题！**

当执行 GitLab 分支合并遇到冲突（MR 状态为 cannot_be_merged、存在冲突文件等）时：

- **绝对禁止 AI 自行解决冲突**
- 禁止手动读取并构造合并后的文件内容
- 禁止在源分支或目标分支上做任何"解决冲突"的提交
- 禁止尝试绕过冲突继续后续发布步骤

**正确做法：**
1. 立即中断整个发版流程，停止所有后续操作
2. 将冲突详情完整告知用户（MR 编号、冲突文件列表等）
3. 明确提示用户：**请手动处理这些冲突，处理完成后告诉我，我再重新执行合并和发版**
4. 在用户明确回复冲突已解决之前，**保持中断等待状态，不执行任何操作**

---

## ⚠️ 重要提示：分支找不到时必须停下询问用户

**用户指定的分支在远程找不到时，AI 绝对不能自行继续！**

当调用 GitLab Skill 查询或合并分支时，如果返回「找不到分支」「分支不存在」「模糊匹配无果」等错误：

- **禁止自行猜测分支名称**（不要加/改 `feat/` 前缀、改大小写、加后缀等）
- **禁止自行创建该分支然后继续**（不要替用户在远程创建不存在的分支）
- **禁止跳过该分支直接执行后续发布步骤**（不要说"找不到就直接发吧"）

**正确做法：**
1. 立即中断整个发版流程，停止所有后续操作
2. 明确告知用户：**远程找不到分支「xxx」（仓库：xxx），请确认该分支是否已经 push 到远程，或分支名称是否正确。确认后告诉我，我再继续。**
3. 在用户确认分支情况并给出明确指示之前，**保持中断等待状态，不执行任何操作**

---

## 作用

这是一个用于「发版」的上层编排 Skill。

它不替代其他 Skill，而是负责协调：

- gitlab skill
- spug skill
- qqc-miniprogram-mcp-server（MCP server，非 Skill）

它主要负责：

1. 理解用户的发版意图。
2. 查询历史发版 Memory。
3. 根据历史操作推断用户没有明确说明的信息。
4. 调用 GitLab Skill 执行分支合并。
5. 调用 Spug Skill 或 qqc-miniprogram-mcp-server 执行发布。
6. 根据实际执行结果记录新的 Memory。
7. 随着用户后续操作不断积累和更新对用户发版习惯的理解。

---

# Memory

持久化 Memory 存放在：

`./memory/releases.jsonl`

每一行代表一次历史发版操作。

Memory 是「历史事实」，不是静态配置。

**绝对不要把历史操作理解成永远不会变化的规则。**

同一个分支在不同时间完全可能使用不同的发版方式。

例如：

```text
feat/盛京支付2

2026-08-01
→ test
→ spug
→ new_h5/test

2026-08-15
→ pre
→ spug
→ new_h5/pre
```

两条记录都必须保留。

不能因为后一次操作发生了，就覆盖之前的记录。

---

# 什么时候查询 Memory

在执行发版操作之前，如果用户没有提供完整信息，应优先查询 Memory。

以下情况尤其需要查询：

- 用户只提供了分支名称。
- 用户只说「发版 xxx」。
- 用户只说「xxx 发测试」。
- 用户没有明确说明合并目标分支。
- 用户没有明确说明发布环境。
- 用户没有明确说明发布项目。
- 用户没有明确说明使用哪个发布工具。
- 用户说「按之前的」。
- 用户说「按照上次的」。
- 用户使用了简写或口语化的项目/分支名称。

查询 Memory 时，尽可能使用以下信息：

- 项目名称
- GitLab 仓库
- 源分支
- 分支别名
- 发布工具
- 发布项目
- 发布环境

优先使用：

1. 项目完全匹配
2. 源分支完全匹配
3. 最近的成功记录
4. 出现频率较高的历史操作

---

# Memory 不是规则

这是本 Skill 最重要的原则。

例如 Memory 中存在：

```text
yeqiao-mobile
feat/盛京支付2
→ test
→ spug
→ new_h5
→ test
```

这只代表：

> 过去这个分支曾经这样发过。

它不代表：

> 以后这个分支永远必须这样发。

如果用户当前明确说：

```text
feat/盛京支付2 合并 pre，发布 pre
```

必须按照用户当前的要求执行：

```text
feat/盛京支付2
→ pre
→ spug
→ new_h5
→ pre
```

不能因为历史上主要发到 test，就擅自改回 test。

---

# 当前用户输入优先级最高

处理发版请求时，优先级：

```text
当前用户明确要求
        ↓
当前上下文
        ↓
最近的成功 Memory
        ↓
历史频率
        ↓
更早的 Memory
```

任何历史 Memory 都不能覆盖用户当前明确表达的要求。

---

# 如何根据 Memory 推断

例如用户只输入：

```text
feat/盛京支付2
```

Memory 中存在：

```text
项目：yeqiao-mobile
分支：feat/盛京支付2

最近一次成功操作：

合并：
feat/盛京支付2 → test

发布：
spug → new_h5 → test
```

如果没有其他冲突，可以推断用户希望按照最近一次成功操作发版。

可以执行：

```text
GitLab：
feat/盛京支付2 → test

Spug：
new_h5 → test
```

---

# 存在冲突时不能擅自猜测

例如 Memory 中存在：

```text
2026-08-01
feat/盛京支付2 → test → new_h5/test

2026-08-10
feat/盛京支付2 → pre → new_h5/pre
```

此时用户只说：

```text
feat/盛京支付2
```

不能简单地选择 test 或 pre。

应该告诉用户：

> 这个分支历史上既发布过 test，也发布过 pre。
> 最近一次是 pre。
> 本次是否按照最近一次的 pre 流程发布？

---

# 发版流程

## 第一步：理解用户意图

尽可能识别：

```text
项目
源分支
合并目标分支
发布工具
发布项目
发布环境
```

用户可能只提供其中一部分。

---

## 第二步：查询 Memory

查询：

`memory/releases.jsonl`

寻找与当前请求相关的历史操作。

如果没有 Memory，正常继续。

如果缺少必要信息，则向用户询问。

---

## 第三步：确定本次发版操作

形成最终操作：

```text
GitLab：
项目
源分支
目标分支

发布：
发布工具
发布项目
发布环境
```

规则：

- 用户明确提供的内容直接使用。
- 用户没有提供的内容可以从 Memory 推断。
- 用户当前输入与 Memory 冲突时，以当前输入为准。
- 多条历史记录存在冲突且无法判断时，询问用户。

---

# 第四步：执行 GitLab 合并

使用 GitLab Skill。

典型操作：

```text
源分支
   ↓
目标分支
```

例如：

```text
feat/盛京支付2
   ↓
test
```

必须确认实际合并结果。

只有实际执行成功后，才能记录为成功。

### 分支找不到时停止确认（强制规则）

在调用 GitLab Skill 执行合并前或过程中，如果返回找不到源分支或目标分支：

- **禁止猜测分支名**（不要加/改前缀、改大小写、模糊联想等）
- **禁止自己创建分支**（不要替用户创建缺失的分支再继续）
- **禁止跳过合并直接发布**（不能说分支找不到就算了直接发）
- 立即中断整个发版流程
- 明确告知用户：**远程找不到分支「xxx」（仓库：xxx），请确认该分支是否已经 push 到远程，或分支名称是否正确。确认后告诉我，我再继续。**
- 在用户确认前保持等待，不执行任何后续步骤

### 合并冲突处理（用户要求，不要自行解决）

如果合并失败（如 MR 状态为 cannot_be_merged / 存在冲突）：

- **不要自行解决冲突**。
- 不要手动构造合并文件。
- 不要修改源分支或目标分支的内容。
- 将冲突情况（涉及哪些文件等）告知用户，**等待用户处理**。

例如：

```text
MR !1078 合并失败，存在冲突，涉及文件：
- moreCoupon.vue
- common.ts
- payOrder2.vue
- paySuccess.vue

请先处理冲突，处理完成后告诉我，我再重新执行合并。
```

用户解决冲突后，再重新执行合并。

---

# 第五步：执行发布

根据最终确定的发布方式选择对应 Skill。

## Spug

如果发布工具为 Spug：

使用 Spug Skill：

- 查询对应应用
- 查询对应环境
- 执行发布
- 查询发布状态

不要自行猜测 Spug 的应用 ID 或其他参数。

## 小程序

如果是小程序发布：

使用 `qqc-miniprogram-mcp-server` 这个 MCP server（SSE 地址：`http://<构建机IP>:3000/sse`）。

根据该 MCP server 提供的能力：

- 构建
- 发布
- 查询发布状态

不要自行编造小程序项目 ID、环境或其他参数。

### 必须先确定是哪个小程序

该服务同时服务**两个**小程序，两个项目共用同一份代码目录，构建前服务会自己把目录切到对应分支：

| project | 小程序 | 构建分支 | 合并目标 |
| :--- | :--- | :--- | :--- |
| `YQ-QQC` | 乔乔车小程序 | `master-mp-test` | `master-mp-test` |
| `YQ-CAR` | 车辆交易市场 | `master-mp-car-test` | `master-mp-car-test` |

`project` 是**必填参数**。不传或传错会返回 400 并列出可选值，**服务不会默认成乔乔车**。

- 用户说「发小程序 xxx」「按之前的发」，先看 Memory 里同一分支历史上的 `project_id`。
- 如果 Memory 里没有任何记录能确定是哪个小程序，**必须停下来问用户**，不要猜。
- 用户明确说「车辆交易市场」「养车」「car」时用 `YQ-CAR`；说「乔乔车」「qqc」时用 `YQ-QQC`。
- 不确定有哪些项目时，先调 `list_projects` 工具（HTTP：`GET /projects`）。

### 合并目标必须与项目匹配

两个小程序的合并目标是**不同**的分支：

```text
YQ-QQC  =  feat/xxx  →  master-mp-test      →  构建 YQ-QQC
YQ-CAR  =  feat/xxx  →  master-mp-car-test  →  构建 YQ-CAR
```

不能因为历史上乔乔车一直是 `master-mp-test`，就把车辆交易市场的发布也合并到 `master-mp-test` —— 那样合并成功了，但构建出来的还是乔乔车的包。

### 轮询结束条件（容易误判）

触发构建后需要轮询 `get_build_status`，结束条件是：

```text
isBuilding === false  且  queuePosition === null
```

**只看 `isBuilding` 会误判**。两个项目共用一份代码目录，同一时刻只允许一个构建在跑：
另一项目正在构建时触发本项目，会返回「已入队，position: n」，此时该项目的 `isBuilding` 仍然是 `false`。
只等 `isBuilding === false` 会立刻认为构建已完成，并向用户报告成功。

`trigger_build` 的三种返回必须区分：

- `Build started` —— 真正开始构建
- `Queued at position n` —— 正在排队，尚未开始
- `A build for XXX is already in progress`（isError）—— 该项目已在构建或已在队列

### 超时与失败

小程序构建含 `pnpm install` + 编译 + 上传，正常需要数分钟；排队时还要等前一个构建结束。
如果轮询超过 20 分钟仍是 `isBuilding: true` 或 `queuePosition` 非空，**不要宣布成功**，
把 `/status?project=xxx` 与 `/log?project=xxx` 的实际内容告诉用户，由用户判断。

---

# 第六步：记录实际结果

发版完成后，将实际执行情况写入：

`memory/releases.jsonl`

必须记录真实结果。

例如：

```text
合并成功
发布成功
```

或者：

```text
合并成功
发布失败
```

不能把失败的操作记录成成功。

---

## 小程序发布记录

小程序发布（`provider: qqc-miniprogram`）除上面的通用字段外，必须额外记录：

| 字段 | 说明 |
| :--- | :--- |
| `project_id` | 服务端的项目 id：`YQ-QQC` 或 `YQ-CAR`。**不要只写中文名**，中文名是给人看的，`project_id` 是调用参数 |
| `application` | 小程序中文名：`乔乔车小程序` / `车辆交易市场`（保留，便于阅读历史） |
| `merge.target` | 必须与该 `project_id` 对应的分支一致：`YQ-QQC`→`master-mp-test`，`YQ-CAR`→`master-mp-car-test` |

示例：

```json
{
  "timestamp": "2026-11-17T15:00:00+08:00",
  "project": "yeqiao-mobile",
  "source_branch": "feat/mp-首页改版",
  "merge": {
    "target": "master-mp-car-test",
    "result": "success"
  },
  "release": {
    "provider": "qqc-miniprogram",
    "project_id": "YQ-CAR",
    "application": "车辆交易市场",
    "environment": "test",
    "result": "success"
  },
  "source": "explicit",
  "result": "success",
  "commit_id": "0ca7ef7ab8064312c9f4db19b0e0a24e52a05950",
  "build_commit": "0ca7ef7ab"
}
```

**本次升级之前的历史记录没有 `project_id` 字段**，那些记录全部是乔乔车小程序（`YQ-QQC`），
推断时按此处理，但**不要回写修改历史记录文件**。

---

# Memory 数据格式

每次发版操作追加一行 JSON。

例如：

```json
{
  "timestamp": "2026-08-13T16:30:00+08:00",
  "project": "yeqiao-mobile",
  "source_branch": "feat/盛京支付2",
  "merge": {
    "target": "test",
    "result": "success"
  },
  "release": {
    "provider": "spug",
    "application": "new_h5",
    "environment": "test",
    "result": "success"
  },
  "source": "explicit",
  "result": "success"
}
```

---

# Memory 来源

`source` 用来记录本次操作的信息来源。

## explicit

用户明确指定。

## memory_inferred

用户没有明确指定，是根据历史 Memory 推断出来的。

## mixed

一部分由用户明确指定，一部分来自 Memory。

---

# 不允许覆盖历史

错误做法：

```text
原来：
feat/盛京支付2 → test

后来：
feat/盛京支付2 → pre

把原来的记录修改成 pre
```

正确做法：

```text
记录 1：
feat/盛京支付2 → test

记录 2：
feat/盛京支付2 → pre
```

历史必须全部保留。

---

# 失败操作也要记录

失败的操作同样具有价值。

例如：

```text
用户要求：

feat/foo → test
```

但 GitLab 合并失败。

应该记录：

```json
{
  "project": "yeqiao-mobile",
  "source_branch": "feat/foo",
  "merge": {
    "target": "test",
    "result": "failed"
  },
  "result": "failed"
}
```

失败记录不能作为主要的「成功操作模式」。

但是不能删除。

---

# 从 Memory 学习用户习惯

Memory 应该随着用户使用逐渐积累。

例如第一次：

```text
用 gitlab 把 feat/foo 合并到 test，
然后用 spug 发布 new_h5 test
```

记录：

```text
feat/foo
→ test
→ new_h5/test
```

以后用户只输入：

```text
feat/foo
```

可以根据历史推断：

```text
→ test
→ new_h5/test
```

后来用户又说：

```text
feat/foo 合并 pre，发布 pre
```

不要覆盖以前的 Memory。

新增：

```text
feat/foo
→ pre
→ new_h5/pre
```

---

# 分支别名

用户不一定每次都输入完整分支名称。

例如：

```text
feat/盛京支付2
```

以后用户可能说：

```text
盛京支付2
盛京支付
盛京
```

如果历史中能够明确判断这些名称对应同一个分支，可以作为检索线索。

但是模糊名称不能作为绝对匹配。

如果存在多个可能的分支，必须询问用户。

---

# 不要只记最终结果

Memory 最好记录一次完整的操作链：

```text
用户输入
    ↓
AI 理解
    ↓
Memory 推断
    ↓
GitLab merge
    ↓
Spug / 小程序发布
    ↓
实际结果
```

这样以后 AI 才能知道用户过去是如何从一个需求走到最终发布的。

---

# 核心原则

```text
Memory 记录过去发生过什么。

Memory 不是静态规则。

当前用户明确要求优先级最高。

用户没有明确说明的信息，可以参考 Memory。

新的操作永远新增 Memory。

旧 Memory 不允许被静默覆盖。

成功操作比失败操作具有更高的推断权重。

当历史存在明显冲突时，不要猜，询问用户。

⚠️ 合并代码遇到冲突时，AI 绝对不能自行解决，必须中断并等待用户手动处理。

⚠️ 用户指定的分支在远程找不到时，AI 绝对不能猜测/创建/跳过，必须中断并等待用户确认分支是否已 push 或名称是否正确。

⚠️ 小程序发布必须明确是哪个 project（YQ-QQC / YQ-CAR），服务不会默认。合并目标必须与 project 对应（YQ-QQC→master-mp-test，YQ-CAR→master-mp-car-test）。

⚠️ 小程序构建的结束条件是 isBuilding === false 且 queuePosition === null，只看 isBuilding 会把排队中的应用误判成已完成。
```
