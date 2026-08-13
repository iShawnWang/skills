---
name: release-skill
description: |
  用于软件发版的编排 Skill。
  负责协调 GitLab 分支合并、Spug 发布以及 qqc-miniprogram-server 小程序发布。
  通过持久化 Memory 记录历史发版操作，让 AI 能够根据过去的操作习惯推断当前发版方式。
---

# Release Skill

## 作用

这是一个用于「发版」的上层编排 Skill。

它不替代其他 Skill，而是负责协调：

- gitlab skill
- spug skill
- qqc-miniprogram-server skill

它主要负责：

1. 理解用户的发版意图。
2. 查询历史发版 Memory。
3. 根据历史操作推断用户没有明确说明的信息。
4. 调用 GitLab Skill 执行分支合并。
5. 调用 Spug Skill 或 qqc-miniprogram-server 执行发布。
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

使用 `qqc-miniprogram-server` Skill。

根据该 Skill 提供的能力：

- 构建
- 发布
- 查询发布状态

不要自行编造小程序项目 ID、环境或其他参数。

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
```
