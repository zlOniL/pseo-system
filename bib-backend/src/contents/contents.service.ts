import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { ValidationResult } from '../validation/validation.types';
import { GenerateDto } from '../generation/dto/generate.dto';

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
  related_services: Array<{ name: string; url: string }> | null;
  meta_description: string | null;
  service_id: string | null;
  generation_mode: 'ai' | 'template';
}

@Injectable()
export class ContentsService {
  constructor(private readonly supabase: SupabaseService) {}

  async save(
    input: GenerateDto,
    html: string,
    validation: ValidationResult,
    metaDescription?: string,
    generationMode: 'ai' | 'template' = 'ai',
  ): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .insert({
        main_keyword: input.main_keyword,
        service: input.service,
        city: input.city,
        neighborhood: input.neighborhood ?? null,
        html,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        video_url: input.video_url ?? null,
        images: input.images ?? null,
        related_services: input.related_services ?? null,
        meta_description: metaDescription ?? null,
        service_id: input.service_id ?? null,
        generation_mode: generationMode,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Content;
  }

  async update(
    id: string,
    html: string,
    validation: ValidationResult,
    input?: Partial<Pick<GenerateDto, 'video_url' | 'images' | 'related_services'>>,
    metaDescription?: string,
  ): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({
        html,
        score: validation.score,
        score_issues: validation.issues,
        status: 'draft',
        ...(input?.video_url !== undefined && { video_url: input.video_url }),
        ...(input?.images !== undefined && { images: input.images }),
        ...(input?.related_services !== undefined && { related_services: input.related_services }),
        ...(metaDescription !== undefined && { meta_description: metaDescription }),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Content;
  }

  async findAll(): Promise<Omit<Content, 'html'>[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .select('id, created_at, main_keyword, service, city, score, score_issues, status, wp_post_url')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Omit<Content, 'html'>[];
  }

  async findById(id: string): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    return data as Content;
  }

  async updateStatus(id: string, status: 'approved' | 'published'): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    return data as Content;
  }

  async delete(id: string): Promise<void> {
    const content = await this.findById(id);
    if (content.status === 'published') {
      throw new Error('Cannot delete a published page');
    }

    // Remove queue items that reference this content so the city becomes
    // selectable again in the scale page (done items with no content are useless)
    await this.supabase
      .getClient()
      .from('queue')
      .delete()
      .eq('content_id', id);

    const { error } = await this.supabase
      .getClient()
      .from('contents')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async bulkUpdateStatus(
    ids: string[],
    status: 'approved' | 'published',
  ): Promise<Content[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({ status })
      .in('id', ids)
      .select();

    if (error) throw new Error(error.message);
    return data as Content[];
  }

  async setPublished(id: string, wpPostId: number, wpPostUrl: string): Promise<Content> {
    const { data, error } = await this.supabase
      .getClient()
      .from('contents')
      .update({ status: 'published', wp_post_id: wpPostId, wp_post_url: wpPostUrl })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) throw new NotFoundException(`Content ${id} not found`);
    return data as Content;
  }
}
