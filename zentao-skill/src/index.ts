import { getConfigStatus, initConfig, loadConfig } from "./config.js";
import { ZentaoClient } from "./client.js";
import { listMyBugs } from "./commands/bugs.js";
import { commentBug } from "./commands/comment.js";
import { closeBug } from "./commands/close.js";
import { diagnose } from "./commands/diagnose.js";
import { getBugDetail } from "./commands/detail.js";
import { assignBug } from "./commands/assign.js";
import { resolveBug } from "./commands/resolve.js";

const USAGE = `用法: npx tsx src/index.ts <command> [参数]

命令:
  init <username> <password> [baseUrl]         初始化配置
  config                                       检查是否已配置，不输出密码
  whoami                                       登录检测
  bugs                                         获取指派给我的 Bug
  detail <bugId> [--include-media]             获取 Bug 详情，默认忽略图片视频附件
  assign <bugId> <assignedTo> [comment]         指派 Bug，可加 --mailto=user1,user2 或 --dry-run
  resolve <bugId> [resolution] [comment]        解决 Bug，可加 --build=trunk 或 --dry-run
  comment <bugId> <comment>                    提交 Bug 评论
  close <bugId> [resolution] [comment]         关闭 Bug
  diagnose [my|login|bug] [bugId]              输出页面表单摘要`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) {
    console.log(USAGE);
    process.exit(1);
  }

  if (command === "init") {
    initConfig(args[1], args[2], args[3]);
    return;
  }

  if (command === "config") {
    console.log(JSON.stringify(getConfigStatus(), null, 2));
    return;
  }

  const client = new ZentaoClient(loadConfig());

  switch (command) {
    case "whoami": {
      const result = await client.login();
      console.log(JSON.stringify({ ...result, baseUrl: client.baseUrl }, null, 2));
      break;
    }
    case "bugs":
      await listMyBugs(client);
      break;
    case "detail":
      await getBugDetail(client, args[1], args.includes("--include-media"));
      break;
    case "assign":
      await assignBug(client, args[1], args[2], args.slice(3));
      break;
    case "resolve":
      await resolveBug(client, args[1], args[2], args.slice(3));
      break;
    case "comment":
      await commentBug(client, args[1], args.slice(2).join(" "));
      break;
    case "close":
      await closeBug(client, args[1], args[2], args.slice(3).join(" "));
      break;
    case "diagnose":
      await diagnose(client, args[1], args[2]);
      break;
    default:
      console.error(`未知命令: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((error) => {
  console.log(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
