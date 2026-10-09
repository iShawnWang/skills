# 项目长期记忆（/Users/qckj/skills）

## 仓库结构

- `/Users/qckj/skills`：Git 仓库 `iShawnWang/skills`（含 `skills/<name>/` 子目录，每个含 `SKILL.md`）。
- `/Users/qckj/skills-sync`：**私有**技能同步仓库（"source of truth"），顶层目录含 `SKILL.md` 即被 `bin/sync-skills` 识别，软链到 `~/.agents/skills`、`~/.claude/skills`、`~/.codebuddy/skills` 等。允许提交 `.env`（私有仓库）。
- WorkBuddy AI 读取的用户级技能目录是 `~/.workbuddy-ai/skills/`（与上面的生态独立）。

## 技能开发约定

- 技术栈：Node.js + TypeScript，用 `npx tsx src/index.ts <command>` 运行；`devDependencies` 只需 `tsx` / `typescript` / `@types/node`。
- 输出约定：**stdout 输出 JSON**（便于 AI 解析），**stderr 输出过程日志**。
- 配置约定：技能应尽量做到零配置开箱即用（如 `yq-pay`）；确需持久化凭据时才用技能目录下 `.env`（`chmod 600`）+ `init` 子命令，且公共仓库中必须 gitignore。

## 业务接口：业桥支付中心（dev）

- 查询订单：`POST https://apideve.yeqiao.cn/dev-api/admin/payOrderSub/getPaymentOrderList`
  - multipart/form-data；必填 `page`、`pageSize`、`select_payOrderNum`；其余 `select_*` 传空字符串。
  - `select_date` 格式 `YYYY-MM-DD,YYYY-MM-DD`，**留空表示全量时间检索**。
  - `select_payOrderNum` 同时匹配 `mchOrderId`(SC 开头)/`payOrderId`(P 开头)/`tradeNo`(T 开头)。
  - 响应：`{ "total": n, "mes": "查询成功", "resultList": [...], "status": 200 }`。
- 模拟支付成功通知：`POST http://10.10.100.44:3030/payCenter/notify/simulate/payNotifyRes/{ICBC|SHENGJING|WX}`
  - body `{"payOrderId":"P..."}`；成功 `{code:200,msg:"操作成功"}`，失败 `{code:500,msg:"操作失败"}`。
- 厂商映射（由 `payVendorName`/`payVendorCode` 判断）：
  | payVendorName | payVendorCode | 通知接口 |
  | --- | --- | --- |
  | 中国工商银行 | ICBC | ICBC |
  | 盛京银行 | SHENGJING | SHENGJING |
  | 业乔科技 | YQ | WX |
- 订单 `status === 2` 且 `paySuccessTime` 非空表示支付成功。
- 同一 `mchOrderId` 可能有多条支付记录（多次支付尝试），取「未支付且 payOrderId 最新」的一条。

## 相关技能

- `yq-pay`：按订单号查询 + 模拟支付成功（本仓库 `skills/yq-pay/`）。
