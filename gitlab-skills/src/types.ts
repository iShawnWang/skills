/** GitLab 用户信息 */
export interface GitLabUser {
  id: number;
  username: string;
  name: string;
  state: string;
  avatar_url: string;
  web_url: string;
  email?: string;
  is_admin?: boolean;
  created_at: string;
}

/** GitLab 项目信息 */
export interface GitLabProject {
  id: number;
  name: string;
  path: string;
  path_with_namespace: string;
  web_url: string;
  default_branch: string;
  description: string | null;
  visibility: string;
  created_at: string;
  last_activity_at: string;
}

/** GitLab 分支信息 */
export interface GitLabBranch {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  web_url: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    author_name: string;
    authored_date: string;
  };
}

/** GitLab Merge Request 信息 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  state: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  merge_error: string | null;
  author: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
}

/** 应用配置 */
export interface AppConfig {
  accessToken: string;
  endpoint: string;
}
