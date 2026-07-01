export interface Content {
  id: string;
  created_at: string;
  site_id: string | null;
  main_keyword: string;
  service: string;
  city: string;
  neighborhood: string | null;
  html: string | null;
  score: number | null;
  score_issues: string[] | null;
  status: 'draft' | 'approved' | 'published';
  wp_post_id: number | null;
  wp_post_url: string | null;
  video_url: string | null;
  images: string[] | null;
  related_services: RelatedService[] | null;
  meta_description: string | null;
  service_id: string | null;
  generation_mode: 'ai' | 'template' | 'library';
  wordpress_category: string | null;
  output_format: 'html' | 'whitelabel_json';
  content_json: WhitelabelContentJson | null;
  external_page_type: 'service' | 'service_location' | 'page' | null;
  external_slug: string | null;
  external_page_id: number | null;
  external_page_url: string | null;
}

export type ContentSummary = Omit<Content, 'html'>;

export interface ContentSection {
  id: string;
  content_id: string;
  section_key: string;
  sort_order: number;
  output_format: 'html' | 'whitelabel_json';
  html: string | null;
  content_json: unknown;
  word_count: number;
  generation_status: 'pending' | 'generating' | 'done' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface PaginatedContents {
  data: ContentSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface RelatedService {
  name: string;
  url: string;
}

export interface GenerateInput {
  main_keyword: string;
  service: string;
  city?: string;
  neighborhood?: string;
  tone?: string;
  min_words?: number;
  related_services?: RelatedService[];
  images?: string[];
  video_url?: string;
  locality_notes?: string;
  service_notes?: string;
  skip_backlinks?: boolean;
  wordpress_category?: string;
  site_id?: string;
}

export interface RegenerateInput extends GenerateInput {
  content_id: string;
  feedback?: string;
}

// ── Services ─────────────────────────────────────────────────────────────────

export interface Service {
  id: string;
  created_at: string;
  site_id: string | null;
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
  featured_image_asset_id: string | null;
  featured_image_alt: string | null;
  featured_image_url?: string | null;
  template_html: string | null;
  template_base_city: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

export type CreateServiceInput = Omit<
  Service,
  | 'id'
  | 'created_at'
  | 'slug'
  | 'status'
  | 'template_html'
  | 'template_base_city'
  | 'featured_image_url'
>;

export interface GenerateTemplateInput {
  base_city?: string;
  service_notes?: string;
  feedback?: string;
  related_services?: RelatedService[];
  is_main_page?: boolean;
  label?: string;
}

export interface TemplateResult {
  content: Content;
  service: Service;
}

// ── Service Templates ─────────────────────────────────────────────────────────

export interface ServiceTemplate {
  id: string;
  created_at: string;
  service_id: string;
  site_id: string | null;
  version: number;
  html: string | null;
  content_json: WhitelabelContentJson | null;
  output_format: 'html' | 'whitelabel_json';
  base_city: string | null;
  images: string[];
  video_url: string | null;
  is_main_page: boolean;
  label: string | null;
  generation_issues: WhitelabelGenerationIssue[];
}

export interface GenerateTemplateResult {
  template: ServiceTemplate;
  content: Content;
  sections_saved: number;
  generation_issues: WhitelabelGenerationIssue[];
}

export interface WhitelabelGenerationIssue {
  section_key: string;
  severity: 'warning' | 'error';
  code:
    | 'rate_limit'
    | 'invalid_json'
    | 'invalid_blocks'
    | 'structure'
    | 'external_links'
    | 'word_count'
    | 'generation_error'
    | 'final_word_count';
  message: string;
  attempts: number;
}

export interface SectionLibrarySummary {
  section_key: string;
  version_count: number;
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  created_at: string;
  site_id: string | null;
  service_id: string;
  city: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: 'ai' | 'template' | 'library';
  template_id: string | null;
  content_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  service?: {
    id: string;
    name: string;
    site_id: string | null;
  } | null;
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

export interface QueueFilters {
  status?: string;
  site_id?: string;
  service_id?: string;
  mode?: string;
  city?: string;
  cities?: string[];
  from?: string;
  to?: string;
  has_error?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedQueueItems {
  data: QueueItem[];
  total: number;
  page: number;
  limit: number;
}

// ── Cities ────────────────────────────────────────────────────────────────────

export interface RegionWithCities {
  region: string;
  cities: string[];
}

// ── WordPress Media ───────────────────────────────────────────────────────────

export interface MediaItem {
  id: number | string;
  title: string;
  url: string;
  mime_type: string;
  date: string;
  thumbnail: string | null;
  alt?: string | null;
}

export interface MediaResponse {
  items: MediaItem[];
  total: number;
  total_pages: number;
  page: number;
}

export interface MediaAsset {
  id: string;
  created_at: string;
  updated_at: string;
  site_id: string | null;
  bucket: string;
  storage_path: string;
  public_url: string;
  title: string;
  alt: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  tags: string[];
  source: string;
}

// ── Bulk Operations ───────────────────────────────────────────────────────────

export interface BulkPublishResult {
  id: string;
  success: boolean;
  data?: Content;
  error?: string;
}

export interface Site {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  domain: string;
  integration_type: 'wordpress' | 'whitelabel_api';
  wordpress_base_url: string | null;
  wordpress_proxy_base: string | null;
  status: 'active' | 'archived';
  has_api_token: boolean;
  has_wordpress_secret: boolean;
}

export interface CreateSiteInput {
  name: string;
  domain: string;
  integration_type: 'wordpress' | 'whitelabel_api';
  api_token?: string;
  wordpress_base_url?: string;
  wordpress_secret?: string;
  wordpress_proxy_base?: string;
}

export interface WhitelabelContentJson {
  topbar?: { left?: string[] };
  hero?: Record<string, unknown>;
  form?: Record<string, unknown>;
  article?:
    | { blocks?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>;
  faqs?: Array<{ question: string; answer: string }>;
}
