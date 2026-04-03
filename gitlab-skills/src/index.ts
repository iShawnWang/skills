import { initConfig, loadConfig } from "./config.js";
import { GitLabClient } from "./client.js";
import { getUserInfo } from "./commands/user.js";
import { getRepos } from "./commands/repos.js";
import { mergeBranches } from "./commands/merge.js";

const USAGE = `用法: npx tsx src/index.ts <command> [参数]

命令:
  init <token> <endpoint>                              初始化配置
  user [username]                                      查询用户信息
  repos [search]                                       查询/搜索仓库
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

    case "merge":
      await mergeBranches(client, args[1], args[2], args[3], args[4]);
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
