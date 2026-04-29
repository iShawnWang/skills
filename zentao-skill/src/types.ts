export interface AppConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export interface FormSummary {
  action: string;
  method: string;
  inputs: string[];
}

export interface ParsedForm {
  action: string;
  method: string;
  fields: Record<string, string>;
}

export interface BugSummary {
  id: number;
  title: string;
  link: string;
  status?: string;
  severity?: string;
  priority?: string;
  rawText: string;
}
