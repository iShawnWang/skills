import type { GitLabClient } from "../client.js";
import type { GitLabProject } from "../types.js";

/**
 * 查询仓库列表
 * - 无参数：列出当前用户的所有项目
 * - 有参数：搜索项目
 */
export async function getRepos(client: GitLabClient, search?: string): Promise<void> {
  const params: Record<string, string> = {
    membership: "true",
    simple: "true",
    per_page: "100",
  };

  if (search) {
    params.search = search;
  }

  const projects = await client.get<GitLabProject[]>("/projects", params);
  console.log(JSON.stringify(projects, null, 2));
}
