import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ContentsService, Content } from '../contents/contents.service';
import { assemblePageHtml } from '../common/html-assembler';
import { slugify } from '../common/slug';

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

@Injectable()
export class WordPressService {
  private readonly logger = new Logger(WordPressService.name);

  constructor(private readonly contents: ContentsService) {}

  async publish(contentId: string): Promise<Content> {
    const content = await this.contents.findById(contentId);
    const fullHtml = assemblePageHtml(content.html, content.video_url);

    const wpUrl = `${process.env.WP_BASE_URL}/wp-json/custom/v1/post`;
    const slug = slugify(content.main_keyword);

    const title = content.main_keyword;
    const seoTitle = `${content.main_keyword} — Atendimento 24h`;

    this.logger.log(`Publishing content ${contentId} to WordPress as slug: ${slug}`);

    const response = await fetch(wpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WP_SECRET}`,
      },
      body: JSON.stringify({
        title,
        seo_title: seoTitle,
        content: fullHtml,
        excerpt: content.meta_description ?? '',
        meta_description: content.meta_description ?? '',
        status: 'publish',
        slug,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`WordPress publish error ${response.status}: ${error}`);
      throw new InternalServerErrorException('WordPress publish failed');
    }

    const result = (await response.json()) as { id: number; link: string };
    return this.contents.setPublished(contentId, result.id, result.link);
  }

  async listMedia(
    type: string = 'image',
    page: number = 1,
    search: string = '',
    perPage: number = 50,
  ): Promise<MediaResponse> {
    const params = new URLSearchParams({
      type,
      page: String(page),
      per_page: String(perPage),
    });
    if (search) params.set('search', search);

    const wpUrl = `${process.env.WP_BASE_URL}/wp-json/custom/v1/media?${params.toString()}`;

    const response = await fetch(wpUrl, {
      headers: { Authorization: `Bearer ${process.env.WP_SECRET}` },
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`WordPress media list error ${response.status}: ${err}`);
      throw new InternalServerErrorException('WordPress media list failed');
    }

    return response.json() as Promise<MediaResponse>;
  }
}
