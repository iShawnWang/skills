import type { GitLabClient } from "../client.js";
import type { GitLabBranch } from "../types.js";
import { findBranchFuzzy, resolveProjectId } from "./utils.js";

/**
 * 查询分支最新 commit 信息
 *
 * @param project - 项目 ID 或项目名称（支持模糊匹配）
 * @param branch - 分支名（支持模糊匹配）
 */
export async function branchInfo(
  client: GitLabClient,
  project: string,
  branch: string
): Promise<void> {
  if (!project || !branch) {
    console.error("用法: branch-info <project_id_or_name> <branch>");
    process.exit(1);
    return;
  }

  // 1. 识别项目 ID
  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  // 2. 识别分支名
  console.error(`正在查找分支 '${branch}'...`);
  const branchName = await findBranchFuzzy(client, projectId, branch);
  if (!branchName) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到分支 '${branch}'` }));
    process.exit(1);
    return;
  }
  console.error(`确定分支: ${branchName}`);

  // 3. 查询分支最新 commit 信息
  const info = await client.get<GitLabBranch>(
    `/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`
  );

  console.log(JSON.stringify({
    success: true,
    project_id: projectId,
    branch: info.name,
    merged: info.merged,
    protected: info.protected,
    default: info.default,
    commit_id: info.commit?.id ?? null,
    commit_short: info.commit?.short_id ?? null,
    commit_title: info.commit?.title ?? null,
    commit_message: info.commit?.message ?? null,
    author_name: info.commit?.author_name ?? null,
    committed_date: info.commit?.committed_date ?? null,
  }));
}
