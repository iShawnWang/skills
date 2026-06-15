import { HttpClient } from "./http.js";
import type {
  AppSummary,
  DeployConfig,
  DeployTriggerResult,
  Environment,
  LoginResult,
  ReleaseRequest,
  ReleaseStatus,
  ResolvedDeployTarget,
  VersionsPayload,
} from "./types.js";

export interface Credentials {
  username: string;
  password: string;
}

export interface CreateReleaseRequestInput {
  deployId: number;
  name: string;
  hostIds: number[];
  extra: [string, string, string] | null;
}

export interface ResolveTargetInput {
  app?: string;
  env?: string;
  deployId?: number;
}

export class SpugClient {
  private readonly http: HttpClient;

  constructor(baseUrl: string) {
    this.http = new HttpClient(baseUrl);
  }

  async login(credentials: Credentials): Promise<LoginResult> {
    const result = await this.http.request<LoginResult>("POST", "/api/account/login/", {
      body: {
        username: credentials.username,
        password: credentials.password,
        type: "default",
      },
    });

    this.http.setToken(result.access_token);
    return result;
  }

  getEnvironments(): Promise<Environment[]> {
    return this.http.request<Environment[]>("GET", "/api/config/environment/");
  }

  getApps(): Promise<AppSummary[]> {
    return this.http.request<AppSummary[]>("GET", "/api/app/");
  }

  getDeployConfigs(appId?: number): Promise<DeployConfig[]> {
    const searchParams = appId ? new URLSearchParams({ app_id: String(appId) }) : undefined;
    return this.http.request<DeployConfig[]>("GET", "/api/app/deploy/", { searchParams });
  }

  getVersions(deployId: number): Promise<VersionsPayload> {
    return this.http.request<VersionsPayload>("GET", `/api/app/deploy/${deployId}/versions/`);
  }

  async createReleaseRequest(input: CreateReleaseRequestInput): Promise<ReleaseRequest> {
    await this.http.request<string>("POST", "/api/deploy/request/ext1/", {
      body: {
        name: input.name,
        deploy_id: input.deployId,
        host_ids: input.hostIds,
        extra: input.extra,
      },
    });

    const requests = await this.listRequests();
    const matched = requests
      .filter((request) => request.deploy_id === input.deployId && request.name === input.name)
      .sort((left, right) => right.id - left.id)[0];

    if (!matched) {
      throw new Error("Release request created, but could not resolve its request id from /api/deploy/request/.");
    }

    return matched;
  }

  listRequests(): Promise<ReleaseRequest[]> {
    return this.http.request<ReleaseRequest[]>("GET", "/api/deploy/request/");
  }

  triggerDeploy(requestId: number, mode = "all"): Promise<DeployTriggerResult> {
    return this.http.request<DeployTriggerResult>("POST", `/api/deploy/request/${requestId}/`, {
      body: { mode },
    });
  }

  getReleaseStatus(requestId: number): Promise<ReleaseStatus> {
    const searchParams = new URLSearchParams({ id: String(requestId) });
    return this.http.request<ReleaseStatus>("GET", "/api/deploy/request/info/", { searchParams });
  }

  async resolveDeployTarget(input: ResolveTargetInput): Promise<ResolvedDeployTarget> {
    if (input.deployId) {
      const deploys = await this.getDeployConfigs();
      const deploy = deploys.find((item) => item.deploy_id === input.deployId || item.id === input.deployId);
      if (!deploy) {
        throw new Error(`Deploy config not found for deploy id ${input.deployId}.`);
      }

      const [apps, environments] = await Promise.all([this.getApps(), this.getEnvironments()]);
      const app = apps.find((item) => item.id === deploy.app_id);
      const environment = environments.find((item) => item.id === deploy.env_id);
      if (!app || !environment) {
        throw new Error(`Deploy config ${deploy.deploy_id} resolved, but app/environment metadata is missing.`);
      }

      return { app, environment, deploy };
    }

    if (!input.app || !input.env) {
      throw new Error("Either --deploy-id or both --app and --env are required.");
    }

    const [apps, environments, deploys] = await Promise.all([
      this.getApps(),
      this.getEnvironments(),
      this.getDeployConfigs(),
    ]);

    const app = matchByIdentity(apps, input.app);
    if (!app) {
      throw new Error(`Application not found: ${input.app}`);
    }

    const environment = matchByIdentity(environments, input.env);
    if (!environment) {
      throw new Error(`Environment not found: ${input.env}`);
    }

    const deploy = deploys.find((item) => item.app_id === app.id && item.env_id === environment.id);
    if (!deploy) {
      throw new Error(`Deploy config not found for app ${app.key} in environment ${environment.key}.`);
    }

    return { app, environment, deploy };
  }
}

function matchByIdentity<T extends { id: number; name: string; key?: string }>(
  items: T[],
  rawNeedle: string,
): T | undefined {
  const needle = rawNeedle.trim().toLowerCase();
  return items.find((item) => {
    return (
      String(item.id) === rawNeedle ||
      item.name.toLowerCase() === needle ||
      item.key?.toLowerCase() === needle
    );
  });
}
