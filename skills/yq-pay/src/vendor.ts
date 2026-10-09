import type { PayOrder } from "./types.js";

export const NOTIFY_VENDORS = ["ICBC", "SHENGJING", "WX"] as const;
export type NotifyVendor = (typeof NOTIFY_VENDORS)[number];

const CODE_MAP: Record<string, NotifyVendor> = {
  ICBC: "ICBC",
  SHENGJING: "SHENGJING",
  YQ: "WX",
  WX: "WX",
  WECHAT: "WX",
};

const KEYWORD_RULES: Array<{ vendor: NotifyVendor; keywords: string[] }> = [
  { vendor: "ICBC", keywords: ["icbc", "工商"] },
  { vendor: "SHENGJING", keywords: ["shengjing", "盛京"] },
  { vendor: "WX", keywords: ["wx", "wechat", "微信", "业乔"] },
];

export interface VendorResolution {
  vendor: NotifyVendor;
  matchedBy: string;
  matchedValue: string;
}

export function resolveNotifyVendor(order: PayOrder): VendorResolution | null {
  const code = typeof order.payVendorCode === "string" ? order.payVendorCode.trim() : "";
  if (code) {
    const hit = CODE_MAP[code.toUpperCase()];
    if (hit) return { vendor: hit, matchedBy: "payVendorCode", matchedValue: code };
  }

  const candidates: Array<[string, unknown]> = [
    ["payVendorCode", order.payVendorCode],
    ["payVendorName", order.payVendorName],
  ];

  for (const [field, raw] of candidates) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const value = raw.trim();
    const lower = value.toLowerCase();
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
        return { vendor: rule.vendor, matchedBy: field, matchedValue: value };
      }
    }
  }

  return null;
}

export function isNotifyVendor(value: string): value is NotifyVendor {
  return (NOTIFY_VENDORS as readonly string[]).includes(value.toUpperCase());
}
