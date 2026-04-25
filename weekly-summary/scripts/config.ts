import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

export interface WeeklySummaryConfig {
  token: string;
  gitlabUrl: string;
  username?: string;
}

const parentDirName = path.basename(path.dirname(__dirname));
const SKILL_ROOT =
  parentDirName === 'dist' ? path.resolve(__dirname, '..', '..') : path.resolve(__dirname, '..');
const ENV_PATH = path.join(SKILL_ROOT, '.env');

export function getEnvPath(): string {
  return ENV_PATH;
}

export function loadSkillEnv(): void {
  if (fs.existsSync(ENV_PATH)) {
    dotenv.config({ path: ENV_PATH });
  }
}

export function initSkillConfig(config: WeeklySummaryConfig): void {
  const token = config.token?.trim();
  const gitlabUrl = config.gitlabUrl?.trim() || 'https://gitlab.com';
  const username = config.username?.trim();

  if (!token) {
    throw new Error('GITLAB_ACCESS_TOKEN is required');
  }

  const lines = [
    `GITLAB_ACCESS_TOKEN=${token}`,
    `GITLAB_ENDPOINT=${gitlabUrl}`,
  ];

  if (username) {
    lines.push(`GITLAB_USERNAME=${username}`);
  }

  fs.writeFileSync(ENV_PATH, `${lines.join('\n')}\n`, 'utf-8');
  fs.chmodSync(ENV_PATH, 0o600);
}
