import axios, { AxiosInstance } from 'axios';

interface GitLabUser {
  id: number;
  username: string;
  name: string;
}

interface Commit {
  id: string;
  short_id: string;
  message: string;
  author_name: string;
  created_at: string;
  additions?: number;
  deletions?: number;
}

interface ProjectDiffStats {
  additions: number;
  deletions: number;
}

export class GitLabClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(token: string, baseUrl: string = 'https://gitlab.com') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json'
      }
    });
  }

  async getCurrentUser(): Promise<GitLabUser> {
    const response = await this.client.get<GitLabUser>('/api/v4/user');
    return response.data;
  }

  async getUserByUsername(username: string): Promise<GitLabUser> {
    const response = await this.client.get<GitLabUser[]>('/api/v4/users', {
      params: { username }
    });
    if (response.data.length === 0) {
      throw new Error(`User '${username}' not found`);
    }
    return response.data[0];
  }

  async getProjects(userId: number): Promise<any[]> {
    const response = await this.client.get('/api/v4/projects', {
      params: {
        owned: false,
        membership: true,
        per_page: 100,
        order_by: 'last_activity_at',
        sort: 'desc'
      }
    });
    return response.data;
  }

  async getProjectCommits(
    projectId: number,
    userId: number,
    startDate: string,
    endDate: string
  ): Promise<(Commit & { refs?: string[] })[]> {
    try {
      const response = await this.client.get<(Commit & { refs?: string[] })[]>(
        `/api/v4/projects/${projectId}/repository/commits`,
        {
          params: {
            author: userId,
            all: true,
            per_page: 100,
            'since': new Date(startDate).toISOString(),
            'until': new Date(endDate).toISOString(),
            'with_stats': false
          }
        }
      );

      // Fetch refs for each commit to know which branch it belongs to
      // Use chunked requests to avoid MaxListenersExceededWarning and server overload
      const commitsWithRefs: (Commit & { refs?: string[] })[] = [];
      const chunkSize = 10;
      for (let i = 0; i < response.data.length; i += chunkSize) {
        const chunk = response.data.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map(async (commit) => {
            try {
              const refsResponse = await this.client.get(
                `/api/v4/projects/${projectId}/repository/commits/${commit.id}/refs`,
                { params: { type: 'branch' } }
              );
              return {
                ...commit,
                refs: refsResponse.data.map((r: any) => r.name)
              };
            } catch (e) {
              return commit;
            }
          })
        );
        commitsWithRefs.push(...chunkResults);
      }

      return commitsWithRefs;
    } catch (error) {
      // Repository might not be accessible
      return [];
    }
  }

  async getCommitDiff(
    projectId: number,
    commitSha: string
  ): Promise<ProjectDiffStats> {
    try {
      const response = await this.client.get(
        `/api/v4/projects/${projectId}/repository/commits/${commitSha}/diff`
      );

      let additions = 0;
      let deletions = 0;

      // Parse diff to count changes
      response.data.forEach((diff: any) => {
        const diff_text = diff.diff || '';
        const lines = diff_text.split('\n');

        lines.forEach((line: string) => {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
          }
        });
      });

      return { additions, deletions };
    } catch (error) {
      return { additions: 0, deletions: 0 };
    }
  }
}
