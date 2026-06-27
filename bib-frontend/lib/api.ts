import {
  Content,
  ContentSection,
  ContentSummary,
  PaginatedContents,
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
  QueueFilters,
  PaginatedQueueItems,
  RegionWithCities,
  MediaResponse,
  MediaAsset,
  BulkPublishResult,
  WpCategory,
  Site,
  CreateSiteInput,
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
  const body = await res.text();
  return (body ? JSON.parse(body) : null) as T;
}

export const api = {
  generate: (input: GenerateInput) =>
    request<Content>('/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listSites: () => request<Site[]>('/sites'),

  getSite: (id: string) => request<Site>(`/sites/${id}`),

  createSite: (input: CreateSiteInput) =>
    request<Site>('/sites', { method: 'POST', body: JSON.stringify(input) }),

  updateSite: (id: string, input: Partial<CreateSiteInput>) =>
    request<Site>(`/sites/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  refreshWhitelabelBlueprints: (siteId: string) =>
    request<{ ok: boolean; blueprints: string[] }>(
      `/sites/${siteId}/whitelabel/blueprints/refresh`,
      { method: 'POST' },
    ),

  testWhitelabelApi: (siteId: string) =>
    request<{ ok: boolean }>(`/sites/${siteId}/whitelabel/test`, {
      method: 'POST',
    }),

  syncWhitelabelServiceImage: (siteId: string, serviceId: string) =>
    request<{ data: unknown }>(
      `/sites/${siteId}/whitelabel/services/${serviceId}/image/sync`,
      {
        method: 'POST',
      },
    ),

  regenerate: (input: RegenerateInput) =>
    request<Content>('/regenerate', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listContents: (params?: {
    status?: string;
    service?: string;
    service_id?: string;
    city?: string;
    cities?: string[];
    page?: number;
    limit?: number;
    site_id?: string;
    from?: string;
    to?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.service) qs.set('service', params.service);
    if (params?.service_id) qs.set('service_id', params.service_id);
    if (params?.city) qs.set('city', params.city);
    if (params?.cities?.length) qs.set('cities', params.cities.join(','));
    if (params?.site_id) qs.set('site_id', params.site_id);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.page && params.page > 1) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<PaginatedContents>(`/contents${q ? `?${q}` : ''}`);
  },

  getContent: (id: string) => request<Content>(`/contents/${id}`),

  getContentSections: (id: string) =>
    request<ContentSection[]>(`/contents/${id}/sections`),

  updateContentSection: (
    id: string,
    sectionKey: string,
    input: { html?: string; content_json?: unknown },
  ) =>
    request<{ content: Content; section: ContentSection }>(
      `/contents/${id}/sections/${sectionKey}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),

  regenerateContentSection: (
    id: string,
    sectionKey: string,
    input?: { feedback?: string },
  ) =>
    request<{ content: Content; section: ContentSection }>(
      `/contents/${id}/sections/${sectionKey}/regenerate`,
      { method: 'POST', body: JSON.stringify(input ?? {}) },
    ),

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

  listServices: (siteId?: string) =>
    request<Service[]>(`/services${siteId ? `?site_id=${siteId}` : ''}`),

  getService: (id: string) => request<Service>(`/services/${id}`),

  createService: (input: CreateServiceInput) =>
    request<Service>('/services', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateService: (id: string, input: Partial<CreateServiceInput>) =>
    request<Service>(`/services/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteService: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/services/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  // Legacy single-template endpoint (kept for backwards compat)
  generateTemplate: (serviceId: string, input: GenerateTemplateInput) =>
    request<TemplateResult>(`/services/${serviceId}/generate-template`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getServiceTemplate: (serviceId: string) =>
    request<{
      template_html: string | null;
      template_base_city: string | null;
    }>(`/services/${serviceId}/template`),

  // ── Service Templates (multi-template) ──────────────────────────────────────

  listTemplates: (serviceId: string) =>
    request<ServiceTemplate[]>(`/services/${serviceId}/templates`),

  createTemplate: (serviceId: string, input: GenerateTemplateInput) =>
    request<GenerateTemplateResult>(`/services/${serviceId}/templates`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  regenerateTemplate: (
    serviceId: string,
    templateId: string,
    input: GenerateTemplateInput,
  ) =>
    request<GenerateTemplateResult>(
      `/services/${serviceId}/templates/${templateId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),

  deleteTemplate: async (
    serviceId: string,
    templateId: string,
  ): Promise<void> => {
    const res = await fetch(
      `${BASE_URL}/services/${serviceId}/templates/${templateId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  renameTemplate: (serviceId: string, templateId: string, label: string) =>
    request<import('./types').ServiceTemplate>(
      `/services/${serviceId}/templates/${templateId}/label`,
      {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      },
    ),

  reextractAllSections: (serviceId: string) =>
    request<{
      templates_processed: number;
      results: Array<{
        templateId: string;
        version: number;
        sections_saved: number;
      }>;
    }>(`/services/${serviceId}/templates/reextract-all`, { method: 'POST' }),

  getLibrarySummary: (serviceId: string) =>
    request<SectionLibrarySummary[]>(
      `/services/${serviceId}/templates/library-summary`,
    ),

  getMainTemplateContent: (serviceId: string) =>
    request<Content | null>(`/services/${serviceId}/templates/main-content`),

  // ── Cities ───────────────────────────────────────────────────────────────────

  getCities: () => request<RegionWithCities[]>('/cities'),

  // ── Queue ─────────────────────────────────────────────────────────────────────

  enqueue: (input: {
    service_id: string;
    cities: string[];
    mode?: 'ai' | 'template' | 'library';
    template_id?: string;
  }) =>
    request<QueueItem[]>('/queue/enqueue', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  listQueue: (params?: QueueFilters) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.site_id) qs.set('site_id', params.site_id);
    if (params?.service_id) qs.set('service_id', params.service_id);
    if (params?.mode) qs.set('mode', params.mode);
    if (params?.city) qs.set('city', params.city);
    if (params?.cities?.length) qs.set('cities', params.cities.join(','));
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.has_error !== undefined)
      qs.set('has_error', String(params.has_error));
    if (params?.page && params.page > 1) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const q = qs.toString();
    return request<PaginatedQueueItems>(`/queue${q ? `?${q}` : ''}`);
  },

  getQueueForService: (serviceId: string) =>
    request<QueueItem[]>(`/queue/service/${serviceId}`),

  getQueueStats: (params?: Omit<QueueFilters, 'page' | 'limit'>) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.site_id) qs.set('site_id', params.site_id);
    if (params?.service_id) qs.set('service_id', params.service_id);
    if (params?.mode) qs.set('mode', params.mode);
    if (params?.city) qs.set('city', params.city);
    if (params?.cities?.length) qs.set('cities', params.cities.join(','));
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.has_error !== undefined)
      qs.set('has_error', String(params.has_error));
    const q = qs.toString();
    return request<QueueStats>(`/queue/stats${q ? `?${q}` : ''}`);
  },

  retryQueueItem: (id: string) =>
    request<QueueItem>(`/queue/${id}/retry`, { method: 'POST' }),

  deleteQueueItem: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/queue/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  bulkDeleteQueue: (ids: string[]) =>
    request<{ deleted: number; skipped: number }>('/queue/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  bulkRetryQueue: (ids: string[]) =>
    request<QueueItem[]>('/queue/bulk-retry', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // ── WordPress Media ─────────────────────────────────────────────────────────

  listMedia: (
    type: 'image' | 'video',
    page: number,
    search: string,
    siteId?: string,
  ) =>
    request<MediaResponse>(
      `/wordpress/media?type=${type}&page=${page}&search=${encodeURIComponent(search)}${siteId ? `&site_id=${siteId}` : ''}`,
    ),

  listSupabaseMedia: (
    type: 'image',
    page: number,
    search: string,
    siteId?: string,
  ) => {
    const qs = new URLSearchParams({ type, page: String(page), search });
    if (siteId) qs.set('site_id', siteId);
    return request<MediaResponse>(`/media?${qs.toString()}`);
  },

  uploadSupabaseMedia: async (input: {
    files: Array<{ file: File; title?: string; alt?: string }>;
    site_id?: string;
    tags?: string[];
  }) => {
    const form = new FormData();
    input.files.forEach((item) => {
      form.append('files', item.file);
      form.append('titles', item.title ?? '');
      form.append('alts', item.alt ?? '');
    });
    if (input.site_id) form.set('site_id', input.site_id);
    if (input.tags?.length) form.set('tags', input.tags.join(','));

    const res = await fetch(`${BASE_URL}/media/upload`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json() as Promise<MediaAsset[]>;
  },

  updateSupabaseMedia: (
    id: string,
    input: { title?: string; alt?: string; tags?: string[] },
  ) =>
    request<MediaAsset>(`/media/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteSupabaseMedia: async (id: string): Promise<void> => {
    const res = await fetch(`${BASE_URL}/media/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  },

  // ── WordPress Categories ────────────────────────────────────────────────────

  getWpCategories: (siteId?: string) =>
    request<WpCategory[]>(
      `/wordpress/categories${siteId ? `?site_id=${siteId}` : ''}`,
    ),
};
