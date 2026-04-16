# 自备
1. 任何本地原生 App 或者 cli 形式的 AI 工具, 如 Trae, Claude Code, Gemini, Cursor, Qwen-code等
2. AI工具需要支持安装 skill, 并访问内网 ip 地址, 网页形式的不行

# 安装

1. 使用 `npx skills add` 安装 https://github.com/iShawnWang/skills/tree/main/gitlab-skills
  - gitlab 访问令牌: <DDDD>/-/profile/personal_access_tokens
  - gitlab 地址: <DDDD>
2. 使用 `npx skills add` 安装 https://github.com/iShawnWang/skills/tree/main/qqc-miniprogram-cli-skill
  - 服务器地址: @前端群里问
3. 使用 `npx skills add` 安装 https://github.com/iShawnWang/spug-skill
  - 服务器地址: <DDDD>
  - 账户名密码: 你的 spug 账号密码

# 使用示例

1. 合并分支:  使用 gitlab-skills 将 yeqiao-mobile 的 master-mp-changeAddress 分支合并到 master-mp-test 分支
2. 合并分支并发布小程序体验版: 使用 gitlab-skills 将 yeqiao-mobile 的 master-mp-changeAddress 分支合并到 master-mp-test 分支, 并使用 qqc-miniprogram-cli-skill 发布一版测试环境小程序
3. 合并分支并发布 H5 测试版: 使用 gitlab-skills 将 yeqiao-mobile 的 master-H5-changeAddress 分支合并到 test 分支, 并使用 spug-skill 发布一版 new_h5 项目 test 分支的测试环境
4. 微信开放接口通知结果: 如果安装了 openilink mcp server, 将执行结果 send_message 发过去
