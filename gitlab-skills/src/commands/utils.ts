import type { GitLabClient } from "../client.js";
import type { GitLabBranch, GitLabProject } from "../types.js";

/**
 * 通过仓库名模糊查找项目 ID。
 * 优先完全匹配 name/path/path_with_namespace，否则返回第一个搜索结果。
 */
export async function resolveProjectId(client: GitLabClient, project: string): Promise<number | null> {
  if (/^\d+$/.test(project)) {
    return parseInt(project, 10);
  }

  console.error(`正在查找仓库 '${project}' 的 ID...`);
  const projects = await client.get<GitLabProject[]>("/projects", {
    search: project,
    membership: "true",
    simple: "true",
  });

  if (projects.length === 0) return null;

  const exact = projects.find(
    (p) => p.name === project || p.path === project || p.path_with_namespace === project
  );
  const projectId = exact ? exact.id : projects[0].id;
  console.error(`找到仓库 ID: ${projectId}`);
  return projectId;
}

/**
 * 通过模糊分支名查找准确的分支名。
 * 优先完全匹配，否则返回第一个搜索结果。
 */
export async function findBranchFuzzy(
  client: GitLabClient,
  projectId: number,
  fuzzyBranch: string
): Promise<string | null> {
  const branches = await client.get<GitLabBranch[]>(
    `/projects/${projectId}/repository/branches`,
    { search: fuzzyBranch }
  );

  if (branches.length === 0) return null;

  const exact = branches.find((b) => b.name === fuzzyBranch);
  return exact ? exact.name : branches[0].name;
}
