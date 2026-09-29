import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';

describe('MediaService', () => {
  function serviceWithClient(client: unknown) {
    return new MediaService({ getClient: () => client } as never);
  }

  it('uploads video files to the media bucket', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://cdn.example.com/sites/site-1/video.mp4' },
    });
    const inserted = {
      id: 'asset-1',
      created_at: '2026-09-29T00:00:00.000Z',
      updated_at: '2026-09-29T00:00:00.000Z',
      site_id: 'site-1',
      bucket: 'service-media',
      storage_path: 'sites/site-1/video.mp4',
      public_url: 'https://cdn.example.com/sites/site-1/video.mp4',
      title: 'Video',
      alt: null,
      mime_type: 'video/mp4',
      size_bytes: 1024,
      width: null,
      height: null,
      tags: [],
      source: 'supabase_storage',
    };
    const client = {
      storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
      from: jest.fn().mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: inserted, error: null }),
          }),
        }),
      }),
    };

    const asset = await serviceWithClient(client).uploadImage({
      file: {
        buffer: Buffer.from('video'),
        mimetype: 'video/mp4',
        originalname: 'video.mp4',
        size: 1024,
      },
      siteId: 'site-1',
    });

    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: 'video/mp4' });
    expect(asset.mime_type).toBe('video/mp4');
  });

  it('rejects videos above 100MB', async () => {
    await expect(
      serviceWithClient({}).uploadImage({
        file: {
          buffer: Buffer.alloc(0),
          mimetype: 'video/mp4',
          originalname: 'large.mp4',
          size: 101 * 1024 * 1024,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
