import type { GitLabClient } from "../client.js";
import type { GitLabUser } from "../types.js";

/**
 * 查询用户信息
 * - 无参数：查询当前认证用户
 * - 有参数：按用户名搜索用户
 */
export async function getUserInfo(client: GitLabClient, username?: string): Promise<void> {
  if (username) {
    const users = await client.get<GitLabUser[]>("/users", { username });
    console.log(JSON.stringify(users, null, 2));
  } else {
    const user = await client.get<GitLabUser>("/user");
    console.log(JSON.stringify(user, null, 2));
  }
}
