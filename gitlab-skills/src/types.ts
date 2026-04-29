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
  merge_status: "can_be_merged" | "unchecked" | "cannot_be_merged" | "cannot_be_merged_recheck" | "checking";
  has_conflicts: boolean;
  blocking_discussions_resolved: boolean;
  author: {
    id: number;
    username: string;
    name: string;
  };
  created_at: string;
}

/** GitLab Merge Request 变更信息 */
export interface GitLabMergeRequestChanges {
  changes: Array<{
    old_path: string;
    new_path: string;
    diff: string;
    new_file: boolean;
    renamed_file: boolean;
    deleted_file: boolean;
  }>;
}

/** GitLab 提交文件操作 */
export interface GitLabCommitAction {
  action: "create" | "delete" | "move" | "update" | "chmod";
  file_path: string;
  previous_path?: string;
  content?: string;
  encoding?: "text" | "base64";
  last_commit_id?: string;
  execute_filemode?: boolean;
}

/** GitLab Commit 信息 */
export interface GitLabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  web_url: string;
  author_name: string;
  authored_date: string;
  committed_date: string;
}

/** 应用配置 */
export interface AppConfig {
  accessToken: string;
  endpoint: string;
}
