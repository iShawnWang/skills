# GitLab AI Skill

这是一个为 AI 设计的 GitLab 集成插件，支持查询用户、仓库以及自动化合并分支。

## 文件结构

- `gitlab_tool.sh`: 核心逻辑脚本。
- `SKILL.md`: AI 指令集（安装时需要放到 `.trae/skills/gitlab-skill/` 下）。
- `.env.gitlab.example`: 环境变量模板。

## 如何分发给他人

1. **打包**: 直接将整个 `gitlab-skills` 文件夹压缩发送给他人。
2. **安装**:
   - 将 `gitlab-skills` 文件夹放入项目根目录。
   - 在项目根目录下创建 `.trae/skills/gitlab-skill/` 文件夹。
   - 将 `gitlab-skills/SKILL.md` 拷贝到上述新建的 `.trae` 目录下。
3. **初始化**:
   - 在 AI 对话框中输入：`帮我初始化 GitLab，token 是 [你的Token]，endpoint 是 [你的地址]`。
   - AI 会自动调用 `gitlab_tool.sh init` 并将配置持久化到 `.env.gitlab`。

## 核心功能

- **查询用户信息**: `gitlab_tool.sh user`
- **查询仓库**: `gitlab_tool.sh repos [关键词]`
- **合并分支**: `gitlab_tool.sh merge [项目ID] [源分支] [目标分支]` (冲突时会自动贴出 MR 地址)
