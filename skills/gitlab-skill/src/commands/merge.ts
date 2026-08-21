import type { GitLabClient } from "../client.js";
import type {
  GitLabBranch,
  GitLabMergeRequest,
  GitLabMergeRequestChanges,
} from "../types.js";
import { findBranchFuzzy, resolveProjectId } from "./utils.js";

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
    return;
  }

  // 1. 识别项目 ID
  const projectId = await resolveProjectId(client, project);
  if (!projectId) {
    console.log(JSON.stringify({ success: false, error: `找不到仓库 '${project}'` }));
    process.exit(1);
    return;
  }

  // 2. 识别源分支名
  console.error(`正在查找源分支 '${source}'...`);
  const sourceBranch = await findBranchFuzzy(client, projectId, source);
  if (!sourceBranch) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到源分支 '${source}'` }));
    process.exit(1);
    return;
  }
  console.error(`确定源分支: ${sourceBranch}`);

  // 3. 识别目标分支名
  console.error(`正在查找目标分支 '${target}'...`);
  const targetBranch = await findBranchFuzzy(client, projectId, target);
  if (!targetBranch) {
    console.log(JSON.stringify({ success: false, error: `在项目 ${projectId} 中找不到目标分支 '${target}'` }));
    process.exit(1);
    return;
  }
  console.error(`确定目标分支: ${targetBranch}`);

  // 4. 创建 Merge Request
  const mrTitle = title || `Merge ${sourceBranch} into ${targetBranch} via GitLab Skill`;
  console.error(`正在创建 Merge Request: ${sourceBranch} -> ${targetBranch}...`);

  let mr: GitLabMergeRequest;
  try {
    mr = await client.post<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests`,
      {
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title: mrTitle,
        remove_source_branch: "false",
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/Another open merge request already exists/i.test(message)) {
      console.error("检测到已存在的 Merge Request，正在尝试获取...");
      const existingMrs = await client.get<GitLabMergeRequest[]>(
        `/projects/${projectId}/merge_requests`,
        {
          source_branch: sourceBranch,
          target_branch: targetBranch,
          state: "opened",
        }
      );
      if (existingMrs.length > 0) {
        mr = existingMrs[0];
        console.error(`获取到现有 MR (IID: ${mr.iid})`);
      } else {
        throw err;
      }
    } else if (/no commits|source branch is the same|empty/i.test(message)) {
      console.log(JSON.stringify({
        success: true,
        message: "已经是最新，无需合并",
        source_branch: sourceBranch,
        target_branch: targetBranch,
      }));
      return;
    } else {
      throw err;
    }
  }

  if (!mr || !mr.iid) {
    console.log(JSON.stringify({ success: false, error: "创建 Merge Request 失败", detail: mr }));
    process.exit(1);
    return;
  }

  // 5. 检查 MR 是否包含实际文件变更。空 MR 直接关闭，避免合并无变更 MR。
  console.error(`Merge Request 已创建 (IID: ${mr.iid})。正在检查变更内容...`);
  const mrChanges = await client.get<GitLabMergeRequestChanges>(
    `/projects/${projectId}/merge_requests/${mr.iid}/changes`
  );

  if (mrChanges.changes.length === 0) {
    console.error("Merge Request 没有文件变更，正在关闭...");
    await client.put<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mr.iid}`,
      { state_event: "close" }
    );

    console.log(JSON.stringify({
      success: true,
      message: "已经是最新，无需合并，空 MR 已关闭",
      mr_url: mr.web_url,
      source_branch: sourceBranch,
      target_branch: targetBranch,
    }));
    return;
  }

  console.error(`检测到 ${mrChanges.changes.length} 个文件变更。正在轮询合并状态...`);

  // 6. 轮询合并状态，直到可以合并或出现冲突
  let currentMr = mr;
  let attempts = 0;
  const maxAttempts = 15; // 最多等待 30s
  while (attempts < maxAttempts) {
    // 检查是否可以合并
    if (currentMr.merge_status === "can_be_merged" && !currentMr.has_conflicts) {
      break;
    }

    if (currentMr.has_conflicts || currentMr.merge_status === "cannot_be_merged") {
      console.log(JSON.stringify({
        success: false,
        message: "合并失败，存在冲突或无法合并",
        merge_status: currentMr.merge_status,
        has_conflicts: currentMr.has_conflicts,
        mr_url: mr.web_url,
      }));
      process.exit(1);
      return;
    }

    console.error(`当前状态: ${currentMr.merge_status}，等待 2s 后重试 (${attempts + 1}/${maxAttempts})...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    currentMr = await client.get<GitLabMergeRequest>(`/projects/${projectId}/merge_requests/${mr.iid}`);
    attempts++;
  }

  if (currentMr.merge_status !== "can_be_merged") {
    console.error(`警告: 达到最大重试次数，当前状态仍为 ${currentMr.merge_status}。尝试强制执行合并...`);
  }

  console.error("正在发送合并请求...");

  // 7. 接受（合并）Merge Request
  try {
    console.error(`正在尝试通过 PUT /merge 合并 MR !${mr.iid}...`);
    const mergeResult = await client.put<GitLabMergeRequest>(
      `/projects/${projectId}/merge_requests/${mr.iid}/merge`,
      {
        should_remove_source_branch: false,
      }
    );

    if (mergeResult.state === "merged") {
      // 查询目标分支最新 commit（合并后可能尚未同步，最多重试 3 次）
      let targetCommit: GitLabBranch["commit"] | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const branchInfo = await client.get<GitLabBranch>(
            `/projects/${projectId}/repository/branches/${encodeURIComponent(targetBranch)}`
          );
          if (branchInfo.commit?.id) {
            targetCommit = branchInfo.commit;
            break;
          }
        } catch {
          // 忽略错误，继续重试
        }
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      console.log(JSON.stringify({
        success: true,
        message: "合并成功",
        mr_url: mr.web_url,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        target_commit_id: targetCommit?.id ?? null,
        target_commit_short: targetCommit?.short_id ?? null,
        target_commit_title: targetCommit?.title ?? null,
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({
      success: false,
      message: "合并失败",
      error: errorMsg,
      mr_url: mr.web_url,
    }));
  }
}
