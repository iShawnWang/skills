import type { GitLabClient } from "../client.js";
import type { GitLabFile, GitLabTreeItem } from "../types.js";
import { resolveProjectId } from "./utils.js";

/**
 * 读取某个仓库的某个文件内容
 */
export async function getFileContent(
  client: GitLabClient,
  project: string,
  filePath: string,
  ref?: string
): Promise<void> {
  if (!project || !filePath) {
    console.error("用法: read <project_id_or_name> <file_path> [ref]");
    process.exit(1);
    return;
  }

  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  // 如果未指定 ref，GitLab API 默认使用默认分支，但我们显式获取它以方便返回
  let finalRef = ref;
  if (!finalRef) {
    const projectDetail = await client.get<any>(`/projects/${projectId}`);
    finalRef = projectDetail.default_branch;
  }

  // 文件路径需要 URL 编码
  const encodedPath = encodeURIComponent(filePath);

  try {
    const params: Record<string, string> = {};
    if (finalRef) params.ref = finalRef;

    const file = await client.get<GitLabFile>(
      `/projects/${projectId}/repository/files/${encodedPath}`,
      params
    );

    // GitLab 返回的内容通常是 base64 编码的
    let content = file.content;
    if (file.encoding === "base64") {
      content = Buffer.from(file.content, "base64").toString("utf8");
    }

    console.log(JSON.stringify({
      success: true,
      file_path: file.file_path,
      size: file.size,
      ref: finalRef,
      content: content,
    }, null, 2));
  } catch (err: any) {
    console.log(JSON.stringify({
      success: false,
      error: `读取文件失败: ${err.message}`,
    }));
    process.exit(1);
  }
}

/**
 * 列出某个仓库的目录结构
 */
export async function listTree(
  client: GitLabClient,
  project: string,
  path?: string,
  ref?: string,
  recursive: boolean = false
): Promise<void> {
  if (!project) {
    console.error("用法: tree <project_id_or_name> [path] [ref] [recursive]");
    process.exit(1);
    return;
  }

  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  const params: Record<string, string> = {
    per_page: "100",
  };
  if (path) params.path = path;
  if (ref) params.ref = ref;
  if (recursive) params.recursive = "true";

  try {
    const tree = await client.get<GitLabTreeItem[]>(
      `/projects/${projectId}/repository/tree`,
      params
    );

    console.log(JSON.stringify({
      success: true,
      project_id: projectId,
      path: path || "/",
      ref: ref || "default",
      recursive,
      items: tree.map(item => ({
        name: item.name,
        type: item.type,
        path: item.path,
      })),
    }, null, 2));
  } catch (err: any) {
    console.log(JSON.stringify({
      success: false,
      error: `获取目录结构失败: ${err.message}`,
    }));
    process.exit(1);
  }
}
