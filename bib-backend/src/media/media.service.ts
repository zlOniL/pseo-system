import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { SupabaseService } from '../common/supabase.service';
import { DbCountResult, DbError, DbResult } from '../common/supabase.types';
import { slugify } from '../common/slug';
import { UpdateMediaDto } from './dto/update-media.dto';

const MEDIA_BUCKET = 'service-media';
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

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

export interface MediaListResponse {
  items: Array<{
    id: string;
    title: string;
    url: string;
    mime_type: string;
    date: string;
    thumbnail: string | null;
    alt: string | null;
  }>;
  total: number;
  total_pages: number;
  page: number;
}

interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(private readonly supabase: SupabaseService) {}

  async uploadImage(input: {
    file: UploadedImageFile;
    siteId?: string;
    title?: string;
    alt?: string;
    tags?: string[];
  }): Promise<MediaAsset> {
    const file = input.file;
    if (!file) throw new BadRequestException('Imagem obrigatoria.');
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Tipo de imagem invalido. Use JPG, PNG, WEBP ou GIF.',
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        'Imagem demasiado grande. Limite maximo: 10MB.',
      );
    }

    const title = input.title?.trim() || this.cleanFileTitle(file.originalname);
    const extension = this.fileExtension(file.originalname, file.mimetype);
    const pathParts = [
      input.siteId ? `sites/${input.siteId}` : 'global',
      `${slugify(title) || 'imagem'}-${randomUUID()}${extension}`,
    ];
    const storagePath = pathParts.join('/');

    const client = this.supabase.getClient();
    const { error: uploadError } = await client.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadError) {
      throw new BadRequestException(
        `Falha no upload da imagem: ${uploadError.message}`,
      );
    }

    const { data: publicData } = client.storage
      .from(MEDIA_BUCKET)
      .getPublicUrl(storagePath);

    const { data, error } = (await client
      .from('media_assets')
      .insert({
        site_id: input.siteId ?? null,
        bucket: MEDIA_BUCKET,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        title,
        alt: input.alt?.trim() || null,
        mime_type: file.mimetype,
        size_bytes: file.size,
        tags: input.tags ?? [],
      })
      .select()
      .single()) as DbResult<MediaAsset>;

    if (error) {
      await client.storage.from(MEDIA_BUCKET).remove([storagePath]);
      this.throwFriendlyMediaError(error);
    }

    return data as MediaAsset;
  }

  async uploadImages(input: {
    files: UploadedImageFile[];
    siteId?: string;
    title?: string;
    alt?: string;
    titles?: string[];
    alts?: string[];
    tags?: string[];
  }): Promise<MediaAsset[]> {
    if (!input.files?.length) {
      throw new BadRequestException('Imagem obrigatoria.');
    }

    const assets: MediaAsset[] = [];
    for (const file of input.files) {
      assets.push(
        await this.uploadImage({
          file,
          siteId: input.siteId,
          title:
            input.titles?.[assets.length] ||
            (input.files.length === 1 ? input.title : undefined),
          alt: input.alts?.[assets.length] || input.alt,
          tags: input.tags,
        }),
      );
    }
    return assets;
  }

  async list(input: {
    type?: string;
    page?: number;
    search?: string;
    siteId?: string;
    limit?: number;
  }): Promise<MediaListResponse> {
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(Math.max(input.limit ?? 24, 1), 60);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .getClient()
      .from('media_assets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (input.type === 'image' || !input.type) {
      query = query.like('mime_type', 'image/%');
    }
    if (input.siteId) {
      query = query.or(`site_id.eq.${input.siteId},site_id.is.null`);
    }
    if (input.search?.trim()) {
      const search = input.search.trim().replace(/[%,_]/g, '');
      query = query.or(`title.ilike.%${search}%,alt.ilike.%${search}%`);
    }

    const { data, error, count } = (await query) as DbCountResult<MediaAsset[]>;
    if (error) this.throwFriendlyMediaError(error);

    const total = count ?? 0;
    return {
      items: (data ?? []).map((asset) => this.toMediaItem(asset)),
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      page,
    };
  }

  async findById(id: string): Promise<MediaAsset> {
    const { data, error } = (await this.supabase
      .getClient()
      .from('media_assets')
      .select('*')
      .eq('id', id)
      .single()) as DbResult<MediaAsset>;

    if (error || !data) {
      if (error) this.throwFriendlyMediaError(error);
      throw new NotFoundException(`Media asset ${id} not found`);
    }

    return data;
  }

  async findByIds(ids: string[]): Promise<MediaAsset[]> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return [];

    const { data, error } = (await this.supabase
      .getClient()
      .from('media_assets')
      .select('*')
      .in('id', uniqueIds)) as DbResult<MediaAsset[]>;

    if (error) this.throwFriendlyMediaError(error);
    return data ?? [];
  }

  async update(id: string, dto: UpdateMediaDto): Promise<MediaAsset> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.title !== undefined) patch.title = dto.title.trim();
    if (dto.alt !== undefined) patch.alt = dto.alt.trim() || null;
    if (dto.tags !== undefined) patch.tags = dto.tags;

    const { data, error } = (await this.supabase
      .getClient()
      .from('media_assets')
      .update(patch)
      .eq('id', id)
      .select()
      .single()) as DbResult<MediaAsset>;

    if (error || !data) {
      if (error) this.throwFriendlyMediaError(error);
      throw new NotFoundException(`Media asset ${id} not found`);
    }

    return data;
  }

  async remove(id: string): Promise<void> {
    const asset = await this.findById(id);
    const client = this.supabase.getClient();
    const { error: storageError } = await client.storage
      .from(asset.bucket)
      .remove([asset.storage_path]);

    if (storageError) {
      throw new BadRequestException(
        `Falha ao remover imagem do storage: ${storageError.message}`,
      );
    }

    const { error } = await client.from('media_assets').delete().eq('id', id);
    if (error) this.throwFriendlyMediaError(error);
  }

  toMediaItem(asset: MediaAsset) {
    return {
      id: asset.id,
      title: asset.title,
      url: asset.public_url,
      mime_type: asset.mime_type,
      date: asset.created_at,
      thumbnail: asset.public_url,
      alt: asset.alt,
    };
  }

  private cleanFileTitle(filename: string): string {
    return (
      filename
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim() || 'Imagem de servico'
    );
  }

  private fileExtension(filename: string, mimeType: string): string {
    const existing = extname(filename).toLowerCase();
    if (existing) return existing;
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    return '.jpg';
  }

  private throwFriendlyMediaError(error: DbError): never {
    if (error.code === '42P01') {
      throw new BadRequestException(
        'Tabela media_assets nao encontrada. Execute a migration supabase-migration-media-assets.sql no Supabase.',
      );
    }
    if (error.code === '42703') {
      throw new BadRequestException(
        `Coluna ausente em media_assets/services: ${error.message}`,
      );
    }
    if (error.code === '23503') {
      throw new BadRequestException(
        'Site ou imagem vinculada nao existe no Supabase.',
      );
    }
    throw new BadRequestException(error.message);
  }
}
