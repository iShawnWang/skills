#!/usr/bin/env node

import { Command } from 'commander';
import { EventEmitter } from 'events';
import { getEnvPath, initSkillConfig, loadSkillEnv } from './config';
import { WeeklyReportGenerator } from './report-generator';

// Increase default max listeners to avoid warnings during concurrent requests
EventEmitter.defaultMaxListeners = 100;

loadSkillEnv();

function initCommand(args: string[]): void {
  const program = new Command();
  program
    .name('node dist/index.js init')
    .requiredOption('--gitlab-token <token>', 'GitLab personal access token')
    .option('--gitlab-url <url>', 'GitLab instance URL (default: https://gitlab.com)')
    .option('--username <name>', 'GitLab username');

  program.parse(['node', 'dist/index.js init', ...args]);
  const options = program.opts();

  initSkillConfig({
    token: options.gitlabToken,
    gitlabUrl: options.gitlabUrl || 'https://gitlab.com',
    username: options.username,
  });

  console.error(`Configuration saved to ${getEnvPath()}`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === 'init') {
    initCommand(argv.slice(1));
    return;
  }

  const program = new Command();

  program
    .name('node dist/index.js')
    .description('GitLab Weekly Report Generator')
    .version('1.0.0')
    .option('--start-date <date>', 'Start date (ISO format: YYYY-MM-DD)')
    .option('--end-date <date>', 'End date (ISO format: YYYY-MM-DD)')
    .option('--gitlab-url <url>', 'GitLab instance URL (default: https://gitlab.com)')
    .option('--gitlab-token <token>', 'GitLab personal access token')
    .option('--username <name>', 'GitLab username (auto-detected if not provided)')
    .addHelpText('after', `
Environment Variables:
  GITLAB_ACCESS_TOKEN     GitLab personal access token (required)
  GITLAB_URL              GitLab instance URL (optional)
  GITLAB_ENDPOINT         Alternative for GITLAB_URL
  GITLAB_USERNAME         GitLab username (optional)

Examples:
  # Generate last week's report
  GITLAB_ACCESS_TOKEN=glpat-xxx node dist/index.js

  # Custom date range
  GITLAB_ACCESS_TOKEN=glpat-xxx node dist/index.js \
    --start-date "2024-01-08" \
    --end-date "2024-01-14"

  # Specific user and instance
  GITLAB_ACCESS_TOKEN=glpat-xxx node dist/index.js \
    --gitlab-url "https://gitlab.company.com" \
    --username "john.doe"

  # Save to file
  GITLAB_ACCESS_TOKEN=glpat-xxx node dist/index.js > weekly-report.md
`);

  program.parse(process.argv);
  const options = program.opts();

  // Get configuration
  const token = options.gitlabToken || process.env.GITLAB_ACCESS_TOKEN;
  const gitlabUrl =
    options.gitlabUrl || process.env.GITLAB_URL || process.env.GITLAB_ENDPOINT || 'https://gitlab.com';
  const username = options.username || process.env.GITLAB_USERNAME;
  const startDate = options.startDate;
  const endDate = options.endDate;

  // Validate token
  if (!token) {
    console.error('❌ Error: GitLab token is required');
    console.error(
      'Please set GITLAB_ACCESS_TOKEN environment variable or pass --gitlab-token'
    );
    console.error(
      '\nGet your token at: https://gitlab.com/-/user_settings/personal_access_tokens'
    );
    process.exit(1);
  }

  try {
    const generator = new WeeklyReportGenerator(token, gitlabUrl);
    const report = await generator.generateReport(username, startDate, endDate);
    console.log(report);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\n❌ Error: ${error.message}`);
    } else {
      console.error(`\n❌ An unexpected error occurred`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
