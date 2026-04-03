import type { GitLabClient } from "../client.js";
import type { GitLabProject, GitLabBranch, GitLabMergeRequest } from "../types.js";

/**
 * 通过仓库名模糊查找项目 ID
 * 优先完全匹配 name 或 path，否则返回第一个搜索结果
 */
async function findProjectIdByName(client: GitLabClient, name: string): Promise<number | null> {
  const projects = await client.get<GitLabProject[]>("/projects", {
    search: name,
    membership: "true",
    simple: "true",
  });

  if (projects.length === 0) return null;

  // 优先完全匹配
  const exact = projects.find((p) => p.name === name || p.path === name);
  return exact ? exact.id : projects[0].id;
}

/**
 * 通过模糊分支名查找准确的分支名
 * 优先完全匹配，否则返回第一个搜索结果
 */
async function findBranchFuzzy(client: GitLabClient, projectId: number, fuzzyBranch: string): Promise<string | null> {
  const branches = await client.get<GitLabBranch[]>(
    `/projects/${projectId}/repository/branches`,
    { search: fuzzyBranch }
  );

  if (branches.length === 0) return null;

  // 优先完全匹配
  const exact = branches.find((b) => b.name === fuzzyBranch);
  return exact ? exact.name : branches[0].name;
}

/**
 * 合并分支
 * 创建 Merge Request 并自动合并
 *
 * @param project - 项目 ID 或项目名称（支持模糊匹配）
 * @param source - 源分支名（支持模糊匹配）
 * @param target - 目标分支名（支持模糊匹配）
 * @param title - MR 标题（可选）
 */
export async function mergeBranches(
  client: GitLabClient,
  project: string,
  source: string,
  target: string,
  title?: string
): Promise<void> {
  if (!project || !source || !target) {
    console.error("用法: merge <project_id_or_name> <source_branch> <target_branch> [title]");
    process.exit(1);
  }

  // 1. 识别项目 ID
  let projectId: number;
  if (/^\d+$/.test(project)) {
    projectId = parseInt(project, 10);
  } else {
    console.error(`正在查找仓库 '${project}' 的 ID...`);
    const foundId = await findProjectIdByName(client, project);
    if (!foundId) {
      console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
      process.exit(1);
    }
    projectId = foundId;
    console.error(`找到仓库 ID: ${projectId}`);
  }

  // 2. 识别源分支名
  console.error(`正在查找源分支 '${source}'...`);
  const sourceBranch = await findBranchFuzzy(client, projectId, source);
  if (!sourceBranch) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到源分支 '${source}'` }));
    process.exit(1);
  }
  console.error(`确定源分支: ${sourceBranch}`);

  // 3. 识别目标分支名
  console.error(`正在查找目标分支 '${target}'...`);
  const targetBranch = await findBranchFuzzy(client, projectId, target);
  if (!targetBranch) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到目标分支 '${target}'` }));
    process.exit(1);
  }
  console.error(`确定目标分支: ${targetBranch}`);

  // 4. 创建 Merge Request
  const mrTitle = title || `Merge ${sourceBranch} into ${targetBranch} via GitLab Skill`;
  console.error(`正在创建 Merge Request: ${sourceBranch} -> ${targetBranch}...`);

  const mr = await client.post<GitLabMergeRequest>(
    `/projects/${projectId}/merge_requests`,
    {
      source_branch: sourceBranch,
      target_branch: targetBranch,
      title: mrTitle,
      remove_source_branch: "false",
    }
  );

  if (!mr.iid) {
    console.log(JSON.stringify({ success: false, error: "创建 Merge Request 失败", detail: mr }));
    process.exit(1);
  }

  console.error(`Merge Request 已创建 (IID: ${mr.iid})。等待 5s 后尝试自动合并...`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.error("正在尝试自动合并...");

  // 5. 接受（合并）Merge Request
  try {
    const mergeResult = await client.put<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mr.iid}/merge`
    );

    if (mergeResult.state === "merged") {
      console.log(JSON.stringify({
        success: true,
        message: "合并成功",
        mr_url: mr.web_url,
        source_branch: sourceBranch,
        target_branch: targetBranch,
      }));
    } else {
      console.log(JSON.stringify({
        success: false,
        message: "合并失败，可能存在冲突或需要手动干预",
        merge_error: mergeResult.merge_error,
        mr_url: mr.web_url,
      }));
    }
  } catch (err) {
    console.log(JSON.stringify({
      success: false,
      message: "合并失败",
      error: err instanceof Error ? err.message : String(err),
      mr_url: mr.web_url,
    }));
  }
}
