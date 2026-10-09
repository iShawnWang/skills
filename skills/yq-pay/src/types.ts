export interface PayOrder {
  id?: number;
  mchOrderId: string;
  payOrderId: string;
  tradeNo?: string;
  payVendorCode?: string;
  payVendorName?: string;
  payWayName?: string;
  payClientTypeName?: string;
  paySceneName?: string;
  channelName?: string;
  productName?: string;
  payOrderAmountYuan?: number;
  status?: number;
  createdTime?: string;
  paySuccessTime?: string | null;
  [key: string]: unknown;
}

export interface QueryResult {
  total: number;
  message: string;
  rows: PayOrder[];
  raw: unknown;
}

export interface NotifyFailure {
  code?: number;
  msg: string;
  location?: string;
}

export interface NotifyResult {
  endpoint: string;
  httpStatus: number;
  body: unknown;
  success: boolean;
  message: string;
  failure?: NotifyFailure;
}
