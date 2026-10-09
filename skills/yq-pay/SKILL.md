---
name: yq-pay
description: 业桥支付中心（yeqiao）订单查询与「模拟支付成功」技能。当用户提供支付订单号（通常以 SC 开头，也可能是 P 开头 payOrderId 或 T 开头 tradeNo）并要求「mock 支付成功 / 模拟支付成功 / 完成支付 / 触发支付回调 / 查一下这笔订单」时使用。也适用于排查支付订单状态、确认订单走哪个支付厂商通道的场景。
---

# yq-pay（业桥支付中心 · 模拟支付成功）

通过「订单查询接口 + 支付中心通知模拟接口」，把一笔未支付的订单直接置为支付成功，用于联调测试。

## 执行须知

- **工作目录**：所有指令在 `yq-pay/` 目录下执行，或使用绝对路径 `npx tsx /path/to/yq-pay/src/index.ts`。
- **输出格式**：stdout 输出 JSON（便于解析），stderr 输出过程日志。
- **环境要求**：Node.js >= 18，无需预装依赖，`npx` 会自动拉取 `tsx`。
- **接口地址**：内置于 `src/config.ts`（查询 `https://apideve.yeqiao.cn/dev-api`、通知 `http://10.10.100.44:3030`），可用环境变量 `YQPAY_API_BASE` / `YQPAY_NOTIFY_BASE` 覆盖。
- **开箱即用**：没有任何需要初始化的配置，克隆后直接执行命令即可。

## ⚠️ 安全规则

1. **执行 mock 前必须先向用户确认**：把查询到的订单信息（订单号、商品名、金额、支付渠道、厂商）和即将调用的通知接口展示给用户，得到确认后再执行。
2. **只对 dev/test 环境使用**。生产环境严禁调用。
3. `payOrderId` 是通知接口的关键入参，务必取自查询结果，不要手工编造。

## ⚠️ 通知失败必须如实告知用户

通知接口的 **HTTP 状态码始终是 200**，业务结果要看响应体里的 `code`：

- `code === 200`：模拟支付成功，可以报成功。
- `code === 500`（或其他非 200）：**接口调用本身是成功的，失败发生在支付中心服务端**（通常是处理该订单时抛异常，响应 `data.stackTrace` 会给出异常位置）。

遇到 `code !== 200` 时：

1. **必须明确告诉用户本次 mock 失败**，不要含糊说成"已完成"或"支付成功"。
2. 说明清楚：接口已按预期调用（厂商 X → 接口 Y），失败发生在支付中心服务端，并附上脚本输出的 `notify.error`（含 `code` / `msg` / `location` 异常位置）。
3. 脚本已在 stderr 打印现成提示语，可直接转述。
4. **不要反复重试同一个订单**，失败原因在服务端，重试不会改变结果。
5. 退出码为 `1`，据此判断。

## 核心流程

### 1. 查询订单（无副作用）

```bash
npx tsx src/index.ts query SC1872981347204220077611
```

接口：`POST https://apideve.yeqiao.cn/dev-api/admin/payOrderSub/getPaymentOrderList`（multipart/form-data，`select_payOrderNum` 传订单号）。

`select_payOrderNum` 支持匹配 `mchOrderId`(SC…)、`payOrderId`(P…)、`tradeNo`(T…)，且**不传日期时为全量时间检索**，因此跨日期订单也能直接查到。

### 2. 模拟支付成功（主命令）

```bash
npx tsx src/index.ts mock SC1872981347204220077611
```

内部依次完成：
1. 查询订单，取出 `payOrderId`、`payVendorName`、`payVendorCode`、`status`；
2. 依据厂商解析出通知接口；
3. `POST http://10.10.100.44:3030/payCenter/notify/simulate/payNotifyRes/{接口}`，body 为 `{"payOrderId":"P..."}`；
4. 复核订单状态是否变为支付成功。

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--date YYYY-MM-DD` | 限定查询日期（默认全量检索） |
| `--dry-run` | 只查询并展示将要调用的接口与入参，不发通知 |
| `--force` | 订单已是支付成功状态时仍强制重发通知 |
| `--no-verify` | 跳过通知后的状态复核 |

若订单已是支付成功状态，脚本默认**跳过**并返回 `skipped: true`。

### 3. 直接指定厂商通知（排查用）

```bash
npx tsx src/index.ts notify P2020261008104414000025 --vendor ICBC
```

## 厂商 → 通知接口映射

`payVendorName` / `payVendorCode` 决定接口最后一段：

| payVendorName | payVendorCode | 通知接口 |
| --- | --- | --- |
| 中国工商银行 | ICBC | `payNotifyRes/ICBC` |
| 盛京银行 | SHENGJING | `payNotifyRes/SHENGJING` |
| 业乔科技 | YQ | `payNotifyRes/WX` |

脚本优先用 `payVendorCode` 精确匹配，失败再按 `payVendorName` 关键字（工商 / 盛京 / 微信 / 业乔）匹配。无法判定时不会瞎猜，会直接报错并提示改用 `notify --vendor`。

## 关键字段说明（查询接口返回）

| 字段 | 含义 |
| --- | --- |
| `mchOrderId` | 商户订单号，用户口中的「订单号」，通常 SC 开头 |
| `payOrderId` | 支付订单号，P 开头，**通知接口入参** |
| `tradeNo` | 交易单号，T 开头 |
| `payVendorName` / `payVendorCode` | 支付厂商名称 / 编码，决定通知接口 |
| `payWayName` | 支付方式（微信、银行卡、支付宝…） |
| `payOrderAmountYuan` | 订单金额（元） |
| `status` | 订单状态，`2` 且 `paySuccessTime` 有值表示支付成功 |
| `paySuccessTime` | 支付成功时间 |

接口响应结构：`{ "total": 1, "mes": "查询成功", "resultList": [...], "status": 200 }`。

通知接口响应结构：成功 `{ "code": 200, "msg": "操作成功", "data": null }`；失败 `{ "code": 500, "msg": "操作失败", "data": { "stackTrace": [...] } }`。`code === 200` 才算成功，失败时脚本会把异常位置汇总到 `notify.error.location`。

## 使用示例

> "SC1872981347204220077611 这个订单帮我 mock 支付成功"
> "查一下订单 SC1475991449287444422475 的信息"
> "这笔订单走的是哪个支付厂商？"
