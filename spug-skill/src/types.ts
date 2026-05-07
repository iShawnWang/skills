export interface ApiResponse<T> {
  data: T;
  error: string | null;
}

export interface LoginResult {
  id: number;
  access_token: string;
  nickname: string;
  is_supper: boolean;
  has_real_ip: boolean;
  permissions: unknown[];
}

export interface Environment {
  id: number;
  name: string;
  key: string;
  desc: string | null;
}

export interface AppSummary {
  id: number;
  name: string;
  key: string;
  desc: string | null;
}

export interface DeployConfig {
  id: number;
  app_id: number;
  env_id: number;
  host_ids: number[];
  extend: string;
  is_audit: boolean;
  is_parallel: boolean;
  app_key: string;
  app_name: string;
  deploy_id: number;
  git_repo?: string;
  require_upload?: boolean;
}

export interface VersionCommit {
  id: string;
  author: string;
  date: string;
  message: string;
}

export interface VersionsPayload {
  branches?: Record<string, VersionCommit[]>;
  tags?: Record<string, VersionCommit>;
}

export interface ReleaseRequest {
  id: number;
  deploy_id: number;
  name: string;
  extra: [string, string, string] | null;
  host_ids: number[];
  status: string;
  reason: string | null;
  version: string;
  created_at: string;
  env_id: number;
  env_name: string;
  app_id: number;
  app_name: string;
  status_alias: string;
  fail_host_ids?: number[];
}

export interface DeployOutputEntry {
  id: number | string;
  title?: string;
  step: number;
  data: string;
}

export interface DeployTriggerResult {
  outputs?: Record<string, DeployOutputEntry>;
}

export interface ReleaseStatus {
  status: string;
  reason: string | null;
  fail_host_ids: number[];
  status_alias: string;
}

export interface ResolvedDeployTarget {
  app: AppSummary;
  environment: Environment;
  deploy: DeployConfig;
}
