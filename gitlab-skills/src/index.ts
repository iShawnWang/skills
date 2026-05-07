import { initConfig, loadConfig } from "./config.js";
import { GitLabClient } from "./client.js";
import { getUserInfo } from "./commands/user.js";
import { getRepos } from "./commands/repos.js";
import { mergeBranches } from "./commands/merge.js";
import { createBranch } from "./commands/branch.js";
import { commitToBranch } from "./commands/commit.js";
import { getFileContent, listTree } from "./commands/files.js";

const USAGE = `用法: npx tsx src/index.ts <command> [参数]

命令:
  init <token> <endpoint>                              初始化配置
  user [username]                                      查询用户信息
  repos [search]                                       查询/搜索仓库
  read <project_id_or_name> <file_path> [ref]          读取文件内容
  tree <project_id_or_name> [path] [ref] [recursive]   列出目录结构
  branch <project_id_or_name> <new_branch> <ref>       基于某个分支创建新分支
  commit <project_id_or_name> <branch> <message> <actions_json_or_@file>
                                                       在某个分支提交代码并 push
  merge <project_id_or_name> <source> <target> [title] 合并分支`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  // init 命令不需要加载配置
  if (command === "init") {
    initConfig(args[1], args[2]);
    return;
  }

  // 其他命令都需要配置
  const config = loadConfig();
  const client = new GitLabClient(config);

  switch (command) {
    case "user":
      await getUserInfo(client, args[1]);
      break;

    case "repos":
      await getRepos(client, args[1]);
      break;

    case "read":
      await getFileContent(client, args[1], args[2], args[3]);
      break;

    case "tree":
      await listTree(client, args[1], args[2], args[3], args[4] === "true");
      break;

    case "merge":
      await mergeBranches(client, args[1], args[2], args[3], args[4]);
      break;

    case "branch":
      await createBranch(client, args[1], args[2], args[3]);
      break;

    case "commit":
      await commitToBranch(client, args[1], args[2], args[3], args[4]);
      break;

    default:
      console.error(`未知命令: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((err) => {
  console.log(JSON.stringify({
    success: false,
    error: err instanceof Error ? err.message : String(err),
  }));
  process.exit(1);
});
