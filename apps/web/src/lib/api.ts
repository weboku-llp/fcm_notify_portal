import type {
  CampaignDeliveryPublic,
  CampaignPublic,
  DeviceTokenPublic,
  ProjectPublic,
  SegmentPublic,
  TemplatePublic,
  TestCredentialsResult,
  TokenSourceTestResult,
  TokenSyncResult,
} from "@notif/contracts";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Only set JSON content-type when there's an actual body — Fastify's
    // default JSON body parser rejects an empty body sent with this header
    // ("Body cannot be empty when content-type is set to 'application/json'"),
    // which would otherwise 400 every body-less POST/DELETE (sync, cancel, etc).
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = json?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, json?.details);
  }
  return json as T;
}

export const api = {
  // Projects
  listProjects: () => request<{ projects: ProjectPublic[] }>("/projects").then((r) => r.projects),
  getProject: (id: string) => request<{ project: ProjectPublic }>(`/projects/${id}`).then((r) => r.project),
  createProject: (body: unknown) =>
    request<{ project: ProjectPublic }>("/projects", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.project,
    ),
  updateProject: (id: string, body: unknown) =>
    request<{ project: ProjectPublic }>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then(
      (r) => r.project,
    ),
  testCredentials: (fcmServiceAccountJson: string) =>
    request<TestCredentialsResult>("/projects/test-credentials", {
      method: "POST",
      body: JSON.stringify({ fcmServiceAccountJson }),
    }),
  testProjectCredentials: (projectId: string, fcmServiceAccountJson: string) =>
    request<TestCredentialsResult>(`/projects/${projectId}/test-credentials`, {
      method: "POST",
      body: JSON.stringify({ fcmServiceAccountJson }),
    }),
  verifyCredentials: (projectId: string) =>
    request<TestCredentialsResult>(`/projects/${projectId}/verify-credentials`, { method: "POST" }),
  testTokenSource: (projectId: string) =>
    request<TokenSourceTestResult>(`/projects/${projectId}/token-source/test`, { method: "POST" }),
  testAndEnableTokenSource: (
    projectId: string,
    body: { tokenSourceApiBaseUrl: string; tokenSourceApiKey?: string },
  ) =>
    request<TokenSourceTestResult & { project: ProjectPublic }>(
      `/projects/${projectId}/token-source/test-and-enable`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  syncTokenSource: (projectId: string) =>
    request<TokenSyncResult>(`/projects/${projectId}/token-source/sync`, { method: "POST" }),

  // Tokens
  listTokens: (projectId: string, activeOnly = false) =>
    request<{ tokens: DeviceTokenPublic[]; activeCount: number; coverageNote: string }>(
      `/projects/${projectId}/tokens?activeOnly=${activeOnly ? "true" : "false"}`,
    ),
  registerToken: (projectId: string, body: unknown) =>
    request<{ token: DeviceTokenPublic }>(`/projects/${projectId}/tokens`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.token),
  deleteToken: (projectId: string, token: string) =>
    request<void>(`/projects/${projectId}/tokens/${encodeURIComponent(token)}`, { method: "DELETE" }),
  estimateAudience: (
    projectId: string,
    body: {
      mode: string;
      segmentId?: string;
      targetUserIds?: string[];
      targetTokens?: string[];
    },
  ) =>
    request<{ estimatedRecipients: number; coverageNote: string }>(
      `/projects/${projectId}/audience-estimate`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  // Segments
  listSegments: (projectId: string) =>
    request<{ segments: SegmentPublic[] }>(`/projects/${projectId}/segments`).then((r) => r.segments),
  createSegment: (projectId: string, body: unknown) =>
    request<{ segment: SegmentPublic }>(`/projects/${projectId}/segments`, {
      method: "POST",
      body: JSON.stringify(body),
    }).then((r) => r.segment),
  estimateSegment: (projectId: string, rules: unknown) =>
    request<{ count: number }>(`/projects/${projectId}/segments/estimate`, {
      method: "POST",
      body: JSON.stringify({ rules }),
    }).then((r) => r.count),

  // Templates
  listTemplates: (projectId?: string, includeGlobal = true) => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    params.set("includeGlobal", includeGlobal ? "true" : "false");
    const q = params.toString();
    return request<{ templates: TemplatePublic[] }>(`/templates${q ? `?${q}` : ""}`).then((r) => r.templates);
  },
  createTemplate: (body: unknown) =>
    request<{ template: TemplatePublic }>("/templates", { method: "POST", body: JSON.stringify(body) }).then(
      (r) => r.template,
    ),
  updateTemplate: (id: string, body: unknown) =>
    request<{ template: TemplatePublic }>(`/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then((r) => r.template),
  deleteTemplate: (id: string) => request<void>(`/templates/${id}`, { method: "DELETE" }),

  // Campaigns
  listCampaigns: (projectId?: string) =>
    request<{ campaigns: CampaignPublic[] }>(
      `/campaigns${projectId ? `?projectId=${projectId}` : ""}`,
    ).then((r) => r.campaigns),
  createCampaign: (projectId: string, body: unknown) =>
    request<{ campaign: CampaignPublic; enqueued: boolean }>(`/projects/${projectId}/campaigns`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cancelCampaign: (id: string) =>
    request<{ campaign: CampaignPublic }>(`/campaigns/${id}/cancel`, { method: "POST" }).then((r) => r.campaign),
  listCampaignDeliveries: (campaignId: string, opts?: { status?: "SENT" | "FAILED" | "STALE"; q?: string }) => {
    const params = new URLSearchParams();
    if (opts?.status) params.set("status", opts.status);
    if (opts?.q?.trim()) params.set("q", opts.q.trim());
    const qs = params.toString();
    return request<{
      campaign: CampaignPublic;
      deliveries: CampaignDeliveryPublic[];
      counts: { sent: number; failed: number; stale: number; total: number };
    }>(`/campaigns/${campaignId}/deliveries${qs ? `?${qs}` : ""}`);
  },
  testSend: (projectId: string, body: unknown) =>
    request<TestCredentialsResult>(`/projects/${projectId}/campaigns/test`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
