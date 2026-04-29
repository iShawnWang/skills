import type { GitLabClient } from "../client.js";
import type { GitLabBranch } from "../types.js";
import { findBranchFuzzy, resolveProjectId } from "./utils.js";

/**
 * 基于已有分支创建新分支。
 */
export async function createBranch(
  client: GitLabClient,
  project: string,
  newBranch: string,
  refBranch: string
): Promise<void> {
  if (!project || !newBranch || !refBranch) {
    console.error("用法: branch <project_id_or_name> <new_branch> <ref_branch>");
    process.exit(1);
    return;
  }

  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  console.error(`正在查找基准分支 '${refBranch}'...`);
  const resolvedRef = await findBranchFuzzy(client, projectId, refBranch);
  if (!resolvedRef) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到基准分支 '${refBranch}'` }));
    process.exit(1);
    return;
  }

  console.error(`正在基于 ${resolvedRef} 创建新分支 ${newBranch}...`);
  const branch = await client.post<GitLabBranch>(
    `/projects/${projectId}/repository/branches`,
    {
      branch: newBranch,
      ref: resolvedRef,
    }
  );

  console.log(JSON.stringify({
    success: true,
    message: "分支创建成功",
    project_id: projectId,
    branch: branch.name,
    ref: resolvedRef,
    web_url: branch.web_url,
    commit: branch.commit.short_id,
  }, null, 2));
}
