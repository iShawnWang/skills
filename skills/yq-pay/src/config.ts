const DEFAULT_API_BASE = "https://apideve.yeqiao.cn/dev-api";
const DEFAULT_NOTIFY_BASE = "http://10.10.100.44:3030";

function normalizeBase(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/\/+$/, "");
}

/** 订单查询接口前缀（可用 YQPAY_API_BASE 覆盖） */
export const API_BASE = normalizeBase(process.env.YQPAY_API_BASE, DEFAULT_API_BASE);

/** 支付中心通知模拟接口前缀（可用 YQPAY_NOTIFY_BASE 覆盖） */
export const NOTIFY_BASE = normalizeBase(process.env.YQPAY_NOTIFY_BASE, DEFAULT_NOTIFY_BASE);
