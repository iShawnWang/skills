import { API_BASE, NOTIFY_BASE } from "./config.js";
import type { NotifyFailure, NotifyResult, PayOrder, QueryResult } from "./types.js";
import type { NotifyVendor } from "./vendor.js";

const PAGE_SIZE = 50;
const MATCH_KEYS: Array<keyof PayOrder> = ["mchOrderId", "payOrderId", "tradeNo"];

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function queryOrders(params: { orderNum: string; date?: string }): Promise<QueryResult> {
  const form = new FormData();
  form.set("page", "1");
  form.set("pageSize", String(PAGE_SIZE));
  form.set("select_date", params.date ? `${params.date},${params.date}` : "");
  form.set("select_paySceneCode", "");
  form.set("select_payVendorCode", "");
  form.set("select_payClientType", "");
  form.set("select_payWayCode", "");
  form.set("select_payOrderNum", params.orderNum);
  form.set("select_channelId", "");
  form.set("select_status", "");

  const endpoint = `${API_BASE}/admin/payOrderSub/getPaymentOrderList`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json, text/plain, */*" },
    body: form,
  });

  const text = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`查询接口返回了非 JSON 内容 (HTTP ${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = raw as { resultList?: PayOrder[]; total?: number; mes?: string; status?: number };

  if (response.status !== 200 || (payload.status !== undefined && payload.status !== 200)) {
    throw new Error(
      `查询接口调用失败 (HTTP ${response.status}): ${payload.mes || JSON.stringify(raw).slice(0, 300)}`,
    );
  }

  const rows = Array.isArray(payload.resultList) ? payload.resultList : [];

  return {
    total: typeof payload.total === "number" ? payload.total : rows.length,
    message: payload.mes || "",
    rows,
    raw,
  };
}

/** 同一订单号可能对应多次支付尝试，返回全部命中记录（去重）。 */
export function matchOrders(rows: PayOrder[], orderNum: string): PayOrder[] {
  const target = normalize(orderNum);
  if (!target) return [];

  const hits: PayOrder[] = [];
  const seen = new Set<string>();

  for (const key of MATCH_KEYS) {
    for (const row of rows) {
      if (normalize(row[key]) !== target) continue;
      const identity = `${row.payOrderId ?? ""}|${row.id ?? ""}|${row.tradeNo ?? ""}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      hits.push(row);
    }
  }

  return hits;
}

export function isPaidOrder(order: PayOrder): boolean {
  return order.status === 2 || !!order.paySuccessTime;
}

/**
 * 多条命中时择优：优先未支付的记录，其次取最新的（payOrderId 倒序，P+时间+序号）。
 */
export function pickOrder(hits: PayOrder[]): PayOrder | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0];

  const unpaid = hits.filter((order) => !isPaidOrder(order));
  const pool = unpaid.length > 0 ? unpaid : hits;

  return pool
    .slice()
    .sort((a, b) => String(b.payOrderId ?? "").localeCompare(String(a.payOrderId ?? "")))[0];
}

interface StackFrame {
  className?: string;
  methodName?: string;
  lineNumber?: number;
}

/** 从支付中心的失败响应里提取可读信息：业务码、提示语、异常位置。 */
function describeFailure(body: unknown, fallback: string): NotifyFailure {
  const record = body as { code?: number; msg?: string; data?: { stackTrace?: StackFrame[] } } | null;
  const code = typeof record?.code === "number" ? record.code : undefined;
  const msg = typeof record?.msg === "string" && record.msg ? record.msg : fallback;

  const frame = record?.data?.stackTrace?.[0];
  const simpleName = frame?.className?.split(".").pop();
  const location = simpleName
    ? `${simpleName}.${frame?.methodName ?? "?"}${frame?.lineNumber && frame.lineNumber > 0 ? `:${frame.lineNumber}` : ""}`
    : undefined;

  return { code, msg, location };
}

export async function sendPayNotify(vendor: NotifyVendor, payOrderId: string): Promise<NotifyResult> {
  const endpoint = `${NOTIFY_BASE}/payCenter/notify/simulate/payNotifyRes/${vendor}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payOrderId }),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  const record = body as { code?: number; msg?: string } | null;
  const hasCode = !!record && typeof record === "object" && typeof record.code === "number";
  const success = hasCode ? record!.code === 200 : response.ok;
  const message = hasCode ? record!.msg || "" : text.slice(0, 200);

  return {
    endpoint,
    httpStatus: response.status,
    body,
    success,
    message,
    failure: success ? undefined : describeFailure(body, message),
  };
}

/** 通知失败时打印到 stderr 的提示语，便于直接转述给用户。 */
export function formatNotifyFailure(vendor: NotifyVendor, result: NotifyResult): string {
  const failure = result.failure;
  const detail = [
    failure?.code !== undefined ? `code=${failure.code}` : undefined,
    failure?.msg ? `msg=${failure.msg}` : undefined,
    failure?.location ? `异常位置=${failure.location}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    `[notify] ❌ 接口已正确调用（${vendor} -> ${result.endpoint}，HTTP ${result.httpStatus}），` +
    `但支付中心返回失败：${detail || "无详情"}。本次 mock 未生效，请如实告知用户。`
  );
}
