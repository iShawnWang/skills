# 发版 Memory

这里保存 `release-skill` 的持久化发版历史。

## releases.jsonl

`releases.jsonl` 是一个追加式历史记录文件。

每一行代表一次发版操作。

它不是静态的发版规则配置。

例如同一个分支可能出现：

```text
feat/foo → test
feat/foo → pre
feat/foo → test
```

这些都是历史事实，应该全部保留。

AI 应该根据历史记录帮助推断当前用户的发版意图，但当前用户的明确要求始终拥有最高优先级。

## 记录原则

- 新操作追加记录。
- 不修改历史记录。
- 不删除历史记录。
- 不把历史记录当成永久规则。
- 成功和失败的操作都可以记录。
- 成功操作作为主要的推断依据。
- 用户明确改变发布方式时，新增一条记录。
- Git 仓库本身同时提供 Memory 的版本历史和审计能力。

## 小程序发布记录

`release.provider` 为 `qqc-miniprogram` 的记录，必须额外带 `project_id`（`YQ-QQC` 或 `YQ-CAR`），
因为构建服务同时服务两个小程序，只记中文名 `application` 无法直接作为调用参数。

`merge.target` 必须与 `project_id` 匹配：

```text
YQ-QQC → master-mp-test
YQ-CAR → master-mp-car-test
```

2026-11 支持第二个小程序之前的历史记录没有 `project_id`，那些全部是乔乔车（`YQ-QQC`）。
**推断时按此处理，但不要回写历史记录文件。**
