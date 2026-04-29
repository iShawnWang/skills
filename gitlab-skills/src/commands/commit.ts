import { readFileSync } from "node:fs";
import type { GitLabClient } from "../client.js";
import type { GitLabCommit, GitLabCommitAction } from "../types.js";
import { findBranchFuzzy, resolveProjectId } from "./utils.js";

function parseActions(actionsInput: string): GitLabCommitAction[] {
  const raw = actionsInput.startsWith("@")
    ? readFileSync(actionsInput.slice(1), "utf8")
    : actionsInput;

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("actions 必须是 JSON 数组，或使用 @file 指向包含 JSON 数组的文件");
  }

  return parsed as GitLabCommitAction[];
}

/**
 * 在指定分支提交文件变更。
 * GitLab Commits API 会直接创建远程提交，相当于 push 到该分支。
 */
export async function commitToBranch(
  client: GitLabClient,
  project: string,
  branch: string,
  message: string,
  actionsInput: string
): Promise<void> {
  if (!project || !branch || !message || !actionsInput) {
    console.error("用法: commit <project_id_or_name> <branch> <message> <actions_json_or_@file>");
    process.exit(1);
    return;
  }

  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  console.error(`正在查找目标分支 '${branch}'...`);
  const targetBranch = await findBranchFuzzy(client, projectId, branch);
  if (!targetBranch) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到目标分支 '${branch}'` }));
    process.exit(1);
    return;
  }

  const actions = parseActions(actionsInput);
  if (actions.length === 0) {
    console.log(JSON.stringify({ success: false, error: "actions 不能为空" }));
    process.exit(1);
    return;
  }

  console.error(`正在向 ${targetBranch} 提交 ${actions.length} 个文件操作...`);
  const commit = await client.post<GitLabCommit>(
    `/projects/${projectId}/repository/commits`,
    {
      branch: targetBranch,
      commit_message: message,
      actions,
    }
  );

  console.log(JSON.stringify({
    success: true,
    message: "提交并 push 成功",
    project_id: projectId,
    branch: targetBranch,
    commit_id: commit.id,
    short_id: commit.short_id,
    title: commit.title,
    web_url: commit.web_url,
  }, null, 2));
}
