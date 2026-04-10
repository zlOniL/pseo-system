import {
  Content,
  ContentSummary,
  GenerateInput,
  RegenerateInput,
  Service,
  CreateServiceInput,
  QueueItem,
  QueueStats,
  RegionWithCities,
  MediaResponse,
  BulkPublishResult,
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

  // ── Cities ───────────────────────────────────────────────────────────────────

  getCities: () => request<RegionWithCities[]>('/cities'),

  // ── Queue ─────────────────────────────────────────────────────────────────────

  enqueue: (input: { service_id: string; cities: string[] }) =>
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
};
