export interface Content {
  id: string;
  created_at: string;
  main_keyword: string;
  service: string;
  city: string;
  neighborhood: string | null;
  html: string;
  score: number | null;
  score_issues: string[] | null;
  status: 'draft' | 'approved' | 'published';
  wp_post_id: number | null;
  wp_post_url: string | null;
  video_url: string | null;
  images: string[] | null;
  related_services: RelatedService[] | null;
  meta_description: string | null;
  generation_mode: 'ai' | 'template';
}

export type ContentSummary = Omit<Content, 'html'>;

export interface RelatedService {
  name: string;
  url: string;
}

export interface GenerateInput {
  main_keyword: string;
  service: string;
  city: string;
  neighborhood?: string;
  tone?: string;
  min_words?: number;
  related_services?: RelatedService[];
  images?: string[];
  video_url?: string;
  locality_notes?: string;
  service_notes?: string;
}

export interface RegenerateInput extends GenerateInput {
  content_id: string;
  feedback?: string;
}

// ── Services ─────────────────────────────────────────────────────────────────

export interface Service {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  video_url: string | null;
  images: string[];
  related_services: RelatedService[];
  service_notes: string | null;
  tone: string;
  min_words: number;
  status: 'active' | 'archived';
  wordpress_category: string | null;
  template_html: string | null;
  template_base_city: string | null;
}

export type CreateServiceInput = Omit<Service, 'id' | 'created_at' | 'slug' | 'status' | 'template_html' | 'template_base_city'>;

export interface GenerateTemplateInput {
  base_city?: string;
  images?: string[];
  video_url?: string;
  service_notes?: string;
  feedback?: string;
}

export interface TemplateResult {
  content: Content;
  service: Service;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  created_at: string;
  service_id: string;
  city: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: 'ai' | 'template';
  content_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

// ── Cities ────────────────────────────────────────────────────────────────────

export interface RegionWithCities {
  region: string;
  cities: string[];
}

// ── WordPress Media ───────────────────────────────────────────────────────────

export interface MediaItem {
  id: number;
  title: string;
  url: string;
  mime_type: string;
  date: string;
  thumbnail: string | null;
}

export interface MediaResponse {
  items: MediaItem[];
  total: number;
  total_pages: number;
  page: number;
}

// ── Bulk Operations ───────────────────────────────────────────────────────────

export interface BulkPublishResult {
  id: string;
  success: boolean;
  data?: Content;
  error?: string;
}
