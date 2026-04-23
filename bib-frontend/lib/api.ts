import {
  Content,
  ContentSummary,
  GenerateInput,
  RegenerateInput,
  Service,
  CreateServiceInput,
  GenerateTemplateInput,
  TemplateResult,
  ServiceTemplate,
  GenerateTemplateResult,
  SectionLibrarySummary,
  QueueItem,
  QueueStats,
  RegionWithCities,
  MediaResponse,
  BulkPublishResult,
  WpCategory,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  generate: (input: GenerateInput) =>
    request<Content>('/generate', { method: 'POST', body: JSON.stringify(input) }),

  regenerate: (input: RegenerateInput) =>
    request<Content>('/regenerate', { method: 'POST', body: JSON.stringify(input) }),

  listContents: () => request<ContentSummary[]>('/contents'),

  getContent: (id: string) => request<Content>(`/contents/${id}`),

  approveContent: (id: string) =>
    request<Content>(`/contents/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    }),

  publishContent: (id: string) =>
    request<Content>(`/contents/${id}/publish`, { method: 'POST' }),

  deleteContent: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/contents/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  bulkApprove: (ids: string[]) =>
    request<Content[]>('/contents/bulk-approve', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkDelete: (ids: string[]) =>
    request<{ deleted: number; skipped: number }>('/contents/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkPublish: (ids: string[]) =>
    request<BulkPublishResult[]>('/contents/bulk-publish', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // ── Services ────────────────────────────────────────────────────────────────

  listServices: () => request<Service[]>('/services'),

  getService: (id: string) => request<Service>(`/services/${id}`),

  createService: (input: CreateServiceInput) =>
    request<Service>('/services', { method: 'POST', body: JSON.stringify(input) }),

  updateService: (id: string, input: Partial<CreateServiceInput>) =>
    request<Service>(`/services/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  archiveService: (id: string) =>
    request<Service>(`/services/${id}`, { method: 'DELETE' }),

  // Legacy single-template endpoint (kept for backwards compat)
  generateTemplate: (serviceId: string, input: GenerateTemplateInput) =>
    request<TemplateResult>(`/services/${serviceId}/generate-template`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getServiceTemplate: (serviceId: string) =>
    request<{ template_html: string | null; template_base_city: string | null }>(
      `/services/${serviceId}/template`,
    ),

  // ── Service Templates (multi-template) ──────────────────────────────────────

  listTemplates: (serviceId: string) =>
    request<ServiceTemplate[]>(`/services/${serviceId}/templates`),

  createTemplate: (serviceId: string, input: GenerateTemplateInput) =>
    request<GenerateTemplateResult>(`/services/${serviceId}/templates`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  regenerateTemplate: (serviceId: string, templateId: string, input: GenerateTemplateInput) =>
    request<GenerateTemplateResult>(`/services/${serviceId}/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteTemplate: async (serviceId: string, templateId: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/services/${serviceId}/templates/${templateId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  reextractAllSections: (serviceId: string) =>
    request<{ templates_processed: number; results: Array<{ templateId: string; version: number; sections_saved: number }> }>(
      `/services/${serviceId}/templates/reextract-all`,
      { method: 'POST' },
    ),

  getLibrarySummary: (serviceId: string) =>
    request<SectionLibrarySummary[]>(`/services/${serviceId}/templates/library-summary`),

  // ── Cities ───────────────────────────────────────────────────────────────────

  getCities: () => request<RegionWithCities[]>('/cities'),

  // ── Queue ─────────────────────────────────────────────────────────────────────

  enqueue: (input: { service_id: string; cities: string[]; mode?: 'ai' | 'template' | 'library'; template_id?: string }) =>
    request<QueueItem[]>('/queue/enqueue', { method: 'POST', body: JSON.stringify(input) }),

  getQueueForService: (serviceId: string) =>
    request<QueueItem[]>(`/queue/service/${serviceId}`),

  getQueueStats: () => request<QueueStats>('/queue/stats'),

  retryQueueItem: (id: string) =>
    request<QueueItem>(`/queue/${id}/retry`, { method: 'POST' }),

  // ── WordPress Media ─────────────────────────────────────────────────────────

  listMedia: (type: 'image' | 'video', page: number, search: string) =>
    request<MediaResponse>(
      `/wordpress/media?type=${type}&page=${page}&search=${encodeURIComponent(search)}`,
    ),

  // ── WordPress Categories (proxied via Vercel to avoid Render IP block) ───────

  getWpCategories: async () => {
    const res = await fetch('/api/wp-cats', { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<WpCategory[]>;
  },
};
