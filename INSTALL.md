# GitLab / Spug / QQC 小程序 CLI Skills 安装引导

---

## 📋 第一步：确认 AI 工具支持

请确认你正在使用的 AI 工具支持以下功能：
- ✅ 能安装/加载 skills（如 `npx skills add`）
- ✅ 能访问内网 IP 地址
- ❌ 网页版 AI 不支持（如纯网页版 Claude）

**支持的 AI 工具：**
- Cursor
- Trae
- Claude Code
- Qwen-code
- 其他支持 MCP/skills 的 CLI 工具

---

## ❓ 第二步：选择要安装的 Skill

**默认安装顺序：**
1. **QQC 小程序 CLI** - 小程序打包发布
2. **Spug** - H5 测试环境发布
3. **GitLab** - 代码管理

**请告诉我你想先安装哪个？**
- 选项 A: QQC 小程序 CLI（推荐，最常用）
- 选项 B: Spug（H5 发布）
- 选项 C: GitLab（代码合并）
- 选项 D: 全部安装（按默认顺序）

> ⏸️ 请回复你的选择，AI 会给出下一步操作

---

## 🛠️ 安装 QQC 小程序 CLI Skill

### 执行安装命令
```bash
npx skills add https://github.com/iShawnWang/skills/tree/main/qqc-miniprogram-cli-skill
```

### 📱 初始化配置
执行初始化命令：
```bash
qqc-miniprogram-cli-skill init
```

**需要提供的信息：**
- 服务器地址：@前端群里询问

---

## 🛠️ 安装 Spug Skill

### 执行安装命令
```bash
npx skills add https://github.com/iShawnWang/skills/tree/main/spug-skill
```

### 🔐 初始化配置
执行初始化命令：
```bash
spug-skill init
```

**需要提供的信息：**
1. **服务器地址**：`<DDDD>`
2. **账户名密码**：你的 Spug 账号密码

> ⚠️ 凭证会自动保存到根目录的 `.env` 文件中，供后续 AI 会话读取。

---

## 🛠️ 安装 GitLab Skills

### 执行安装命令
```bash
npx skills add https://github.com/iShawnWang/skills/tree/main/gitlab-skills
```

### 🔑 初始化配置
执行初始化命令：
```bash
gitlab-skills init
```

**需要提供的信息：**

1. **GitLab 地址**：`<DDDD>`（例如：`gitlab.example.com`）
2. **访问令牌**：
   - 前往 `https://<DDDD>/-/profile/personal_access_tokens` 创建
   - 建议权限：`api`、`read_user`
   - 名称可填：`ai-skill-bot`

---

## ✅ 测试已安装的 Skill

### 测试 GitLab Skills
```bash
gitlab-skills list-repos
```

### 测试 QQC 小程序 CLI Skill
通过 AI 触发测试：
```
使用 qqc-miniprogram-cli-skill 获取构建状态
```

### 测试 Spug Skill
```bash
spug-skill list-apps
```

> 如果测试成功，说明安装完成！

---

## 🎯 使用示例

### 场景 1：合并分支
```
使用 gitlab-skills 将 yeqiao-mobile 的 master-mp-changeAddress 分支合并到 master-mp-test 分支
```

### 场景 2：合并并发布小程序
```
使用 gitlab-skills 合并 yeqiao-mobile 的 master-mp-changeAddress 到 master-mp-test，
然后使用 qqc-miniprogram-cli-skill 发布测试环境小程序
```

### 场景 3：合并并发布 H5
```
使用 gitlab-skills 合并 yeqiao-mobile 的 master-H5-changeAddress 到 test 分支，
然后使用 spug-skill 发布 new_h5 项目的 test 分支测试环境
```

### 场景 4：发送通知
```
如果安装了 openilink mcp server，将执行结果通过 send_message 发送给相关人员
```

---

## ⚠️ 常见问题

### Q1: 初始化时 AI 不问我参数怎么办？
**A:** 手动在终端运行 `gitlab-skills init` 等命令，AI 会等待你的输入

### Q2: 密码输入时看不到字符？
**A:** 正常现象，输完按回车即可

### Q3: 如何确认安装成功？
**A:** 运行测试命令，如果输出列表内容即成功

### Q4: 配置保存到哪里？
**A:** 自动保存到本地项目配置，后续使用无需重复输入

---

## 📞 需要帮助？

如果执行过程中遇到问题，请提供：
1. 执行的命令
2. 完整的错误信息
3. 你正在使用的 AI 工具名称
