import type { ToolDefinition } from "../types.js";

export interface GitHubClientOptions {
  token: string;
  allowedRepositories: readonly string[];
  apiBaseUrl?: string;
}

export class GitHubRestClient {
  private readonly allowedRepositories: ReadonlySet<string>;
  private readonly apiBaseUrl: string;

  public constructor(private readonly options: GitHubClientOptions) {
    this.allowedRepositories = new Set(options.allowedRepositories);
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/$/u, "");
  }

  private assertRepository(repository: string): void {
    if (!this.allowedRepositories.has(repository)) {
      throw new Error(`Repository ${repository} is not allowed for this Vortex runtime.`);
    }
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.options.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...init?.headers,
      },
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`GitHub API ${response.status}: ${text.slice(0, 500)}`);
    }
    return body;
  }

  public async readFile(repository: string, path: string, ref?: string): Promise<string> {
    this.assertRepository(repository);
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const body = await this.request(`/repos/${repository}/contents/${path.split("/").map(encodeURIComponent).join("/")}${suffix}`);
    if (typeof body !== "object" || body === null) throw new Error("Unexpected GitHub file response.");
    const record = body as Record<string, unknown>;
    if (record.encoding !== "base64" || typeof record.content !== "string") {
      throw new Error("GitHub file response was not base64 content.");
    }
    return Buffer.from(record.content.replace(/\n/gu, ""), "base64").toString("utf8");
  }

  public async createIssue(repository: string, title: string, body: string): Promise<unknown> {
    this.assertRepository(repository);
    return await this.request(`/repos/${repository}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body }),
      headers: { "Content-Type": "application/json" },
    });
  }
}

function inputObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null) throw new Error("Expected object input.");
  return input as Record<string, unknown>;
}

function stringField(input: unknown, key: string, required = true): string | undefined {
  const value = inputObject(input)[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${key} must be a string.`);
  return value;
}

export function createGitHubTools(client: GitHubRestClient): ToolDefinition[] {
  return [
    {
      name: "github.read_file",
      description: "Read a UTF-8 text file from an allowlisted GitHub repository.",
      permissions: ["read", "network"],
      validate: (input) => ({
        repository: stringField(input, "repository") as string,
        path: stringField(input, "path") as string,
        ref: stringField(input, "ref", false),
      }),
      execute: async ({ repository, path, ref }) => ({
        ok: true,
        data: await client.readFile(repository, path, ref),
      }),
    },
    {
      name: "github.create_issue",
      description: "Create an issue in an allowlisted GitHub repository.",
      permissions: ["network", "write", "external_side_effect"],
      validate: (input) => ({
        repository: stringField(input, "repository") as string,
        title: stringField(input, "title") as string,
        body: stringField(input, "body", false) ?? "",
      }),
      execute: async ({ repository, title, body }) => ({
        ok: true,
        data: await client.createIssue(repository, title, body),
      }),
    },
  ];
}
