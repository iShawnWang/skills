---
name: "zentao-bug-fix-workflow"
description: "禅道 Bug 修复自动化工作流。当用户要求修复特定 Bug ID 时，此 Skill 会引导 AI 串联禅道、GitLab 并完成修复提交全流程。"
---

# ZenTao Bug Fix Workflow

此 Skill 定义了 AI 修复 Bug 的标准化作业程序 (SOP)，通过调用 `zentao-mcp-server` 和 `gitlab-skill` 实现自动化。

## 触发条件
- 用户输入包含“修复 Bug”、“处理禅道 Bug”以及明确的 `Bug ID` 时。

## 执行阶段 (SOP)

### 阶段 1: 禅道信息获取
1. **确认服务**: 如果不知道 `zentao-mcp-server` 的地址，先询问用户。
2. **获取详情**: 调用 `zentao-mcp-server` 的 `/bug_detail` 接口获取 Bug 标题、重现步骤、附件等。
3. **补充上下文**: 检查 Bug 描述中是否包含以下关键信息，若缺失则**必须询问用户**：
    - **GitLab 仓库名/路径**
    - **基准分支** (务必确认，**严禁默认使用 master/main**)
    - **涉及的具体页面或文件名** (如果重现步骤中未明确)
4. **记录备注**: 将用户补充的上述信息通过 `/comment_bug` 接口回填到禅道 Bug 的备注中。

### 阶段 2: 代码诊断与准备
1. **代码探索**: 使用 `gitlab-skill` 的 `tree` 命令查看用户提供的仓库结构。
2. **读取源码**: 根据 Bug 描述和文件名，使用 `read` 命令读取相关代码片段进行诊断。
3. **创建分支**: 
    - 分支命名建议: `fix/zentao-bug-<ID>`。
    - 基准分支使用用户阶段 1 提供的分支。
    - 调用 `gitlab-skill` 的 `branch` 命令创建新分支。

### 阶段 3: 修复与提交
1. **编写修复代码**: 根据诊断结果，生成修复逻辑。
2. **提交变更**: 使用 `gitlab-skill` 的 `commit` 命令提交代码到新创建的分支。
3. **创建 MR**: 
    - 调用 `gitlab-skill` 的 `merge` 命令将新分支合并回基准分支。
    - **注意**: 此操作会生成一个 Merge Request。

### 阶段 4: 结果交付
1. **反馈用户**: 向用户提供新生成的 Merge Request (MR) 链接。
2. **禅道状态**: (可选) 询问用户是否需要调用 `/resolve_bug` 将禅道 Bug 设为已解决。

## 注意事项
- **安全第一**: 在进行任何 `commit` 或 `merge` 操作前，务必向用户简述你的修复方案并确认。
- **分支准确性**: 严禁在未确认的情况下假设分支名称。
- **Token 节省**: 使用 `tree` 命令时优先非递归探索，按需进入目录。
