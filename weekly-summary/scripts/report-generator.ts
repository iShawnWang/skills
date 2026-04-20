import { GitLabClient } from './gitlab-client';

interface Activity {
  title: string;
  url?: string;
  date: string;
  project: string;
  branch?: string;
  stats?: {
    additions: number;
    deletions: number;
  };
}

interface ProjectActivity {
  projectName: string;
  branchGroups: {
    branchName: string;
    commits: Activity[];
    stats: {
      additions: number;
      deletions: number;
    };
  }[];
  stats: {
    additions: number;
    deletions: number;
  };
}

export class WeeklyReportGenerator {
  private client: GitLabClient;

  constructor(token: string, baseUrl?: string) {
    this.client = new GitLabClient(token, baseUrl);
  }

  async generateReport(
    username?: string,
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    // Default to last week
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end);
    start.setDate(start.getDate() - 7);

    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    console.error(
      `\n📊 正在生成 ${startDateStr} 至 ${endDateStr} 的提交报告...`
    );

    // Get user info
    let user;
    if (username) {
      user = await this.client.getUserByUsername(username);
      console.error(`👤 找到用户: ${user.name} (@${user.username})`);
    } else {
      user = await this.client.getCurrentUser();
      console.error(`👤 当前用户: ${user.name} (@${user.username})`);
    }

    console.error('📥 正在获取项目列表...');
    const projects = await this.client.getProjects(user.id);

    console.error('📥 正在从各项目中提取提交记录...');
    const projectActivities: ProjectActivity[] = [];

    // Process projects and their commits
    for (const project of projects.slice(0, 50)) {
      try {
        const commits = await this.client.getProjectCommits(
          project.id,
          user.id,
          startDateStr,
          endDateStr
        );

        // Filter commits to ensure only the current user's commits are included
        // Also filter out merge-related commits (MR commits)
        const filteredCommits = commits.filter((commit) => {
          const isAuthor =
            commit.author_name === user.name ||
            commit.author_name === user.username;
          const isMergeCommit =
            commit.message.startsWith('Merge branch') ||
            commit.message.startsWith('Merge remote-tracking branch') ||
            commit.message.startsWith('Merge pull request');
          return isAuthor && !isMergeCommit;
        });

        if (filteredCommits.length > 0) {
          console.error(`   在 ${project.name} 中找到 ${filteredCommits.length} 条提交记录`);

          // Group by branch
          const branchMap = new Map<string, { commits: Activity[], additions: number, deletions: number }>();

          // Limit diff fetching
          const commitsToFetchStats = filteredCommits.slice(0, 20);
          const enrichedCommits = await Promise.all(
            commitsToFetchStats.map(async (commit) => {
              const stats = await this.client.getCommitDiff(project.id, commit.id);
              return { ...commit, stats };
            })
          );

          let projectAdditions = 0;
          let projectDeletions = 0;

          for (const commit of filteredCommits) {
            const enriched = enrichedCommits.find(c => c.id === commit.id);
            const stats = enriched?.stats;
            const branchName = commit.refs?.[0] || '未知分支';

            if (stats) {
              projectAdditions += stats.additions;
              projectDeletions += stats.deletions;
            }

            if (!branchMap.has(branchName)) {
              branchMap.set(branchName, { commits: [], additions: 0, deletions: 0 });
            }

            const group = branchMap.get(branchName)!;
            group.commits.push({
              title: commit.message.split('\n')[0],
              url: `${project.web_url}/-/commit/${commit.id}`,
              date: commit.created_at,
              project: project.name,
              branch: branchName,
              stats: stats
            });
            if (stats) {
              group.additions += stats.additions;
              group.deletions += stats.deletions;
            }
          }

          projectActivities.push({
            projectName: project.name,
            branchGroups: Array.from(branchMap.entries()).map(([name, data]) => ({
              branchName: name,
              commits: data.commits,
              stats: { additions: data.additions, deletions: data.deletions }
            })),
            stats: {
              additions: projectAdditions,
              deletions: projectDeletions
            }
          });
        }
      } catch (error) {
        // Silently skip projects with access issues
      }
    }

    // Calculate total stats
    const totalCommits = projectActivities.reduce((sum, p) =>
      sum + p.branchGroups.reduce((bSum, b) => bSum + b.commits.length, 0), 0);
    const totalAdditions = projectActivities.reduce((sum, p) => sum + p.stats.additions, 0);
    const totalDeletions = projectActivities.reduce((sum, p) => sum + p.stats.deletions, 0);

    // Generate markdown
    return this.generateMarkdown(
      user.name,
      startDateStr,
      endDateStr,
      projectActivities,
      {
        commitsCount: totalCommits,
        additions: totalAdditions,
        deletions: totalDeletions
      }
    );
  }

  private generateMarkdown(
    userName: string,
    startDate: string,
    endDate: string,
    projectActivities: ProjectActivity[],
    stats: {
      commitsCount: number;
      additions: number;
      deletions: number;
    }
  ): string {
    let md = '';

    md += `# 每周工作提交报告: ${userName} 📊\n\n`;
    md += `*统计时间: ${startDate} 至 ${endDate}*\n\n`;

    // Summary
    md += '## 📈 活动摘要\n\n';
    md += `- **总提交数**: ${stats.commitsCount}\n`;
    md += `- **活跃项目数**: ${projectActivities.length}\n`;
    md += `- **预估变更**: +${stats.additions} / -${stats.deletions} 行 (来自已分析的提交)\n\n`;

    // Projects
    if (projectActivities.length > 0) {
      md += `## 🚀 项目详细详情\n\n`;

      // Sort projects by total commit count
      const sortedProjects = [...projectActivities].sort((a, b) => {
        const aCount = a.branchGroups.reduce((sum, g) => sum + g.commits.length, 0);
        const bCount = b.branchGroups.reduce((sum, g) => sum + g.commits.length, 0);
        return bCount - aCount;
      });

      for (const project of sortedProjects) {
        const totalProjectCommits = project.branchGroups.reduce((sum, g) => sum + g.commits.length, 0);
        md += `### ${project.projectName} (${totalProjectCommits} 条提交)\n`;
        if (project.stats.additions > 0 || project.stats.deletions > 0) {
          md += `*项目变更: +${project.stats.additions} / -${project.stats.deletions}*\n\n`;
        } else {
          md += '\n';
        }

        // Sort branch groups by commit count or name
        const sortedBranches = [...project.branchGroups].sort((a, b) => b.commits.length - a.commits.length);

        for (const group of sortedBranches) {
          md += `- **分支: ${group.branchName}** (${group.commits.length} 条提交)\n`;
          if (group.stats.additions > 0 || group.stats.deletions > 0) {
            md += `  *分支变更: +${group.stats.additions} / -${group.stats.deletions}*\n`;
          }

          for (const commit of group.commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())) {
            md += `  - ${commit.title}`;
            if (commit.stats && (commit.stats.additions > 0 || commit.stats.deletions > 0)) {
              md += ` (+${commit.stats.additions}/-${commit.stats.deletions})`;
            }
            if (commit.url) {
              md += ` [🔗](${commit.url})`;
            }
            md += '\n';
          }
          md += '\n';
        }
        md += '\n';
      }
    } else {
      md += '*在选定时间段内未发现提交活动。*\n\n';
    }

    md += '---\n\n';
    md += '*由乔周报生成器自动生成*\n';

    return md;
  }
}
