#!/usr/bin/env node
import { isPaidOrder, matchOrders, pickOrder, queryOrders, sendPayNotify, formatNotifyFailure } from "./client.js";
import { NOTIFY_BASE } from "./config.js";
import { NOTIFY_VENDORS, isNotifyVendor, resolveNotifyVendor } from "./vendor.js";
import type { PayOrder } from "./types.js";

const USAGE = `用法: npx tsx src/index.ts <command> [参数]

命令:
  query <订单号> [--date YYYY-MM-DD]
                                查询订单信息（不产生任何副作用）
  mock  <订单号> [--date YYYY-MM-DD] [--dry-run] [--force] [--no-verify]
                                查询订单 -> 按 payVendorName 选通知接口 -> 模拟支付成功
  notify <payOrderId> --vendor <ICBC|SHENGJING|WX>
                                直接对指定厂商发送支付成功通知

说明:
  - 订单号通常以 SC 开头（对应 mchOrderId），也支持 payOrderId(P 开头) / tradeNo(T 开头)。
  - 同一订单号存在多条支付记录时，自动优先选择「未支付」且最新的一条。
  - --date 不传时按全量时间范围检索。
  - --dry-run 只查询并展示将要调用的接口，不实际通知。
  - --force 订单已是支付成功状态时仍继续通知。
  - --no-verify 跳过通知后的状态复核。
  - 厂商映射: 中国工商银行/ICBC -> ICBC, 盛京银行/SHENGJING -> SHENGJING, 业乔科技/YQ/微信 -> WX`;

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function out(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function flagValue(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function brief(order: PayOrder): Record<string, unknown> {
  return {
    mchOrderId: order.mchOrderId,
    payOrderId: order.payOrderId,
    tradeNo: order.tradeNo,
    productName: order.productName,
    amountYuan: order.payOrderAmountYuan,
    paySceneName: order.paySceneName,
    channelName: order.channelName,
    payWayName: order.payWayName,
    payClientTypeName: order.payClientTypeName,
    payVendorCode: order.payVendorCode,
    payVendorName: order.payVendorName,
    status: order.status,
    createdTime: order.createdTime,
    paySuccessTime: order.paySuccessTime,
  };
}

interface Resolved {
  order: PayOrder;
  candidates: PayOrder[];
}

async function resolveOrder(orderNum: string, date?: string): Promise<Resolved> {
  const result = await queryOrders({ orderNum, date });
  const hits = matchOrders(result.rows, orderNum);
  const order = pickOrder(hits);

  if (!order) {
    throw new Error(
      `未查询到订单「${orderNum}」（接口返回 total=${result.total}，本次取回 ${result.rows.length} 条）。请确认订单号是否正确。`,
    );
  }

  return { order, candidates: hits };
}

function candidatesInfo(candidates: PayOrder[]): Record<string, unknown> | undefined {
  if (candidates.length <= 1) return undefined;
  return {
    count: candidates.length,
    note: "同一订单号存在多条支付记录，已优先选择未支付且最新的一条；如不符预期请显式指定 payOrderId。",
    items: candidates.map((item) => ({
      payOrderId: item.payOrderId,
      tradeNo: item.tradeNo,
      status: item.status,
      createdTime: item.createdTime,
      paySuccessTime: item.paySuccessTime,
      payVendorName: item.payVendorName,
    })),
  };
}

async function cmdQuery(positional: string[], flags: Record<string, string | boolean>): Promise<void> {
  const orderNum = positional[0];
  if (!orderNum) throw new Error("用法: query <订单号> [--date YYYY-MM-DD]");

  const { order, candidates } = await resolveOrder(orderNum, flagValue(flags, "date"));
  console.error(`[query] 已找到订单 ${order.mchOrderId}（${order.payVendorName || order.payVendorCode || "未知厂商"}）`);

  out({ success: true, order: brief(order), candidates: candidatesInfo(candidates), raw: order });
}

async function cmdMock(positional: string[], flags: Record<string, string | boolean>): Promise<void> {
  const orderNum = positional[0];
  if (!orderNum) throw new Error("用法: mock <订单号> [--date YYYY-MM-DD] [--dry-run] [--force] [--no-verify]");

  const dryRun = flags["dry-run"] === true;
  const force = flags.force === true;
  const verify = flags["no-verify"] !== true;
  const date = flagValue(flags, "date");

  const { order, candidates } = await resolveOrder(orderNum, date);

  const resolution = resolveNotifyVendor(order);
  if (!resolution) {
    throw new Error(
      `无法根据 payVendorName/payVendorCode 判断通知接口。厂商信息: code=${order.payVendorCode || "-"}, name=${order.payVendorName || "-"}。` +
        ` 可用接口: ${NOTIFY_VENDORS.join(" / ")}，可改用 'notify <payOrderId> --vendor <接口>' 手动指定。`,
    );
  }

  console.error(
    `[mock] 订单 ${order.mchOrderId} | 商品: ${order.productName || "-"} | 金额: ${order.payOrderAmountYuan ?? "-"} | 厂商: ${order.payVendorName || "-"}(${order.payVendorCode || "-"}) -> 接口 ${resolution.vendor}`,
  );

  if (isPaidOrder(order) && !force && !dryRun) {
    out({
      success: false,
      skipped: true,
      reason: "订单已是支付成功状态，未重复通知（如需强制重发请加 --force）",
      order: brief(order),
      candidates: candidatesInfo(candidates),
      vendor: resolution,
    });
    return;
  }

  if (dryRun) {
    out({
      success: true,
      dryRun: true,
      order: brief(order),
      candidates: candidatesInfo(candidates),
      vendor: resolution,
      notify: {
        endpoint: `${NOTIFY_BASE}/payCenter/notify/simulate/payNotifyRes/${resolution.vendor}`,
        payload: { payOrderId: order.payOrderId },
      },
    });
    return;
  }

  if (!order.payOrderId) {
    throw new Error(`订单 ${order.mchOrderId} 缺少 payOrderId，无法发送通知。`);
  }

  const notify = await sendPayNotify(resolution.vendor, order.payOrderId);

  if (!notify.success) {
    console.error(formatNotifyFailure(resolution.vendor, notify));
  }

  let verified: Record<string, unknown> | undefined;
  if (verify) {
    try {
      const after = await resolveOrder(order.mchOrderId, date);
      verified = { status: after.order.status, paySuccessTime: after.order.paySuccessTime };
    } catch (error) {
      verified = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  out({
    success: notify.success,
    order: brief(order),
    candidates: candidatesInfo(candidates),
    vendor: resolution,
    notify: {
      endpoint: notify.endpoint,
      httpStatus: notify.httpStatus,
      body: notify.body,
      message: notify.message,
      error: notify.failure,
    },
    verified,
  });

  if (!notify.success) process.exitCode = 1;
}

async function cmdNotify(positional: string[], flags: Record<string, string | boolean>): Promise<void> {
  const payOrderId = positional[0];
  const vendorFlag = flagValue(flags, "vendor");

  if (!payOrderId || !vendorFlag) {
    throw new Error(`用法: notify <payOrderId> --vendor <${NOTIFY_VENDORS.join("|")}>`);
  }
  if (!isNotifyVendor(vendorFlag)) {
    throw new Error(`不支持的厂商接口「${vendorFlag}」，可用值: ${NOTIFY_VENDORS.join(" / ")}`);
  }

  const vendor = vendorFlag.toUpperCase() as (typeof NOTIFY_VENDORS)[number];
  const notify = await sendPayNotify(vendor, payOrderId);

  if (!notify.success) {
    console.error(formatNotifyFailure(vendor, notify));
  }

  out({
    success: notify.success,
    notify: {
      endpoint: notify.endpoint,
      httpStatus: notify.httpStatus,
      body: notify.body,
      message: notify.message,
      error: notify.failure,
    },
  });

  if (!notify.success) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "-h" || command === "--help") {
    console.log(USAGE);
    return;
  }

  const { positional, flags } = parseArgs(args.slice(1));

  switch (command) {
    case "query":
      await cmdQuery(positional, flags);
      return;

    case "mock":
      await cmdMock(positional, flags);
      return;

    case "notify":
      await cmdNotify(positional, flags);
      return;

    default:
      console.error(`未知命令: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exit(1);
});
