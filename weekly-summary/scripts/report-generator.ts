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

interface DateGroup {
  date: string;
  commits: Activity[];
  stats: {
    additions: number;
    deletions: number;
  };
}

interface BranchGroup {
  branchName: string;
  dateGroups: DateGroup[];
  stats: {
    additions: number;
    deletions: number;
  };
}

interface ProjectActivity {
  projectName: string;
  branchGroups: BranchGroup[];
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
    // 处理日期：确保包含起始日的 00:00 到结束日的 23:59
    let end: Date;
    let start: Date;

    if (endDate) {
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }

    if (startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    }

    const startDateISO = start.toISOString();
    const endDateISO = end.toISOString();
    const startDateDisplay = startDateISO.split('T')[0];
    const endDateDisplay = endDateISO.split('T')[0];

    console.error(
      `\n📊 正在生成 ${startDateDisplay} 00:00 至 ${endDateDisplay} 23:59 的提交报告...`
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
          startDateISO,
          endDateISO
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

          // Group by branch, then by date
          const branchMap = new Map<string, Map<string, { commits: Activity[], additions: number, deletions: number }>>();

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
            const dateKey = commit.created_at.split('T')[0];

            if (stats) {
              projectAdditions += stats.additions;
              projectDeletions += stats.deletions;
            }

            if (!branchMap.has(branchName)) {
              branchMap.set(branchName, new Map());
            }
            const dateMap = branchMap.get(branchName)!;

            if (!dateMap.has(dateKey)) {
              dateMap.set(dateKey, { commits: [], additions: 0, deletions: 0 });
            }
            const group = dateMap.get(dateKey)!;
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

          // Convert to the structure expected by generateMarkdown
          const branchGroups: BranchGroup[] = Array.from(branchMap.entries()).map(([branchName, dateMap]) => {
            let branchAdditions = 0;
            let branchDeletions = 0;
            const dateGroups: DateGroup[] = Array.from(dateMap.entries()).map(([date, data]) => {
              branchAdditions += data.additions;
              branchDeletions += data.deletions;
              return {
                date,
                commits: data.commits,
                stats: { additions: data.additions, deletions: data.deletions }
              };
            });
            return {
              branchName,
              dateGroups,
              stats: { additions: branchAdditions, deletions: branchDeletions }
            };
          });

          projectActivities.push({
            projectName: project.name,
            branchGroups,
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
      sum + p.branchGroups.reduce((bSum, b) => bSum + b.dateGroups.reduce((s, d) => s + d.commits.length, 0), 0), 0);
    const totalAdditions = projectActivities.reduce((sum, p) => sum + p.stats.additions, 0);
    const totalDeletions = projectActivities.reduce((sum, p) => sum + p.stats.deletions, 0);

    // Generate markdown
    return this.generateMarkdown(
      user.name,
      startDateDisplay,
      endDateDisplay,
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
        const aCount = a.branchGroups.reduce((sum, g) => sum + g.dateGroups.reduce((s, d) => s + d.commits.length, 0), 0);
        const bCount = b.branchGroups.reduce((sum, g) => sum + g.dateGroups.reduce((s, d) => s + d.commits.length, 0), 0);
        return bCount - aCount;
      });

      for (const project of sortedProjects) {
        const totalProjectCommits = project.branchGroups.reduce((sum, g) => sum + g.dateGroups.reduce((s, d) => s + d.commits.length, 0), 0);
        md += `### ${project.projectName} (${totalProjectCommits} 条提交)\n`;
        if (project.stats.additions > 0 || project.stats.deletions > 0) {
          md += `*项目变更: +${project.stats.additions} / -${project.stats.deletions}*\n\n`;
        } else {
          md += '\n';
        }

        // Sort branch groups by total commit count
        const sortedBranches = [...project.branchGroups].sort((a, b) => {
          const aCount = a.dateGroups.reduce((s, d) => s + d.commits.length, 0);
          const bCount = b.dateGroups.reduce((s, d) => s + d.commits.length, 0);
          return bCount - aCount;
        });

        for (const group of sortedBranches) {
          md += `- **分支: ${group.branchName}** (${group.dateGroups.reduce((s, d) => s + d.commits.length, 0)} 条提交)\n`;
          if (group.stats.additions > 0 || group.stats.deletions > 0) {
            md += `  *分支变更: +${group.stats.additions} / -${group.stats.deletions}*\n`;
          }

          // Sort date groups by date (descending)
          const sortedDateGroups = [...group.dateGroups].sort((a, b) => b.date.localeCompare(a.date));

          for (const dateGroup of sortedDateGroups) {
            md += `  - **${dateGroup.date}** (${dateGroup.commits.length} 条提交)\n`;

            for (const commit of dateGroup.commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())) {
              md += `    - ${commit.title}`;
              if (commit.stats && (commit.stats.additions > 0 || commit.stats.deletions > 0)) {
                md += ` (+${commit.stats.additions}/-${commit.stats.deletions})`;
              }
              if (commit.url) {
                md += ` [🔗](${commit.url})`;
              }
              md += '\n';
            }
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
