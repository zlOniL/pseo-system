import { BadRequestException } from '@nestjs/common';
import { PublishingService } from './publishing.service';

describe('PublishingService', () => {
  function createSubject() {
    const contents = {
      findById: jest.fn(),
      findByIds: jest.fn(),
    };
    const sites = {
      findById: jest.fn(),
    };
    const wordpress = {
      publish: jest.fn().mockResolvedValue({ id: 'wp-content' }),
      bulkPublish: jest
        .fn()
        .mockResolvedValue([{ id: 'wp-content', success: true }]),
    };
    const whitelabel = {
      publish: jest.fn().mockResolvedValue({ id: 'wl-content' }),
    };
    const ftpHtml = {
      publish: jest.fn().mockRejectedValue(new Error('ftp disabled')),
    };

    return {
      service: new PublishingService(
        contents as never,
        sites as never,
        wordpress as never,
        whitelabel as never,
        ftpHtml as never,
      ),
      contents,
      sites,
      wordpress,
      whitelabel,
      ftpHtml,
    };
  }

  it('routes WordPress content to WordPressService', async () => {
    const { service, contents, sites, wordpress } = createSubject();
    contents.findById.mockResolvedValue({ id: 'content-1', site_id: 'site-wp' });
    sites.findById.mockResolvedValue({
      id: 'site-wp',
      name: 'WP',
      integration_type: 'wordpress',
    });

    await service.publish('content-1');

    expect(wordpress.publish).toHaveBeenCalledWith('content-1');
  });

  it('routes whitelabel content to WhitelabelPublisherService', async () => {
    const { service, contents, sites, whitelabel, wordpress } = createSubject();
    contents.findById.mockResolvedValue({ id: 'content-2', site_id: 'site-wl' });
    sites.findById.mockResolvedValue({
      id: 'site-wl',
      name: 'WL',
      integration_type: 'whitelabel_api',
    });

    await service.publish('content-2');

    expect(whitelabel.publish).toHaveBeenCalledWith('content-2');
    expect(wordpress.publish).not.toHaveBeenCalled();
  });

  it('keeps current no-site content behavior by routing to WordPressService', async () => {
    const { service, contents, sites, wordpress } = createSubject();
    contents.findById.mockResolvedValue({ id: 'content-legacy', site_id: null });

    await service.publish('content-legacy');

    expect(sites.findById).not.toHaveBeenCalled();
    expect(wordpress.publish).toHaveBeenCalledWith('content-legacy');
  });

  it('routes ftp_html content to the FTP publisher, which is currently flag-blocked', async () => {
    const { service, contents, sites, ftpHtml } = createSubject();
    contents.findById.mockResolvedValue({ id: 'content-ftp', site_id: 'site-ftp' });
    sites.findById.mockResolvedValue({
      id: 'site-ftp',
      name: 'FTP',
      integration_type: 'ftp_html',
    });

    await expect(service.publish('content-ftp')).rejects.toThrow('ftp disabled');
    expect(ftpHtml.publish).toHaveBeenCalledWith('content-ftp');
  });

  it('passes forceRemoteConflict to the selected publisher', async () => {
    const { service, contents, sites, ftpHtml } = createSubject();
    contents.findById.mockResolvedValue({ id: 'content-ftp', site_id: 'site-ftp' });
    sites.findById.mockResolvedValue({
      id: 'site-ftp',
      name: 'FTP',
      integration_type: 'ftp_html',
    });

    await expect(
      service.publish('content-ftp', { forceRemoteConflict: true }),
    ).rejects.toThrow('ftp disabled');
    expect(ftpHtml.publish).toHaveBeenCalledWith('content-ftp', {
      forceRemoteConflict: true,
    });
  });

  it('returns a controlled error for unknown integrations', async () => {
    const { service, contents, sites } = createSubject();
    contents.findById.mockResolvedValue({
      id: 'content-unknown',
      site_id: 'site-unknown',
    });
    sites.findById.mockResolvedValue({
      id: 'site-unknown',
      name: 'Mystery',
      integration_type: 'mystery',
    });

    await expect(service.publish('content-unknown')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bulk publish keeps individual results across publishers', async () => {
    const { service, contents, sites, wordpress, whitelabel, ftpHtml } =
      createSubject();
    contents.findByIds.mockResolvedValue([
      { id: 'wp-content', site_id: 'site-wp' },
      { id: 'wl-content', site_id: 'site-wl' },
      { id: 'ftp-content', site_id: 'site-ftp' },
    ]);
    sites.findById.mockImplementation((id: string) => {
      const integrations: Record<string, string> = {
        'site-wp': 'wordpress',
        'site-wl': 'whitelabel_api',
        'site-ftp': 'ftp_html',
      };
      return Promise.resolve({
        id,
        name: id,
        integration_type: integrations[id],
      });
    });

    const result = await service.bulkPublish([
      'wp-content',
      'wl-content',
      'ftp-content',
    ]);

    expect(wordpress.bulkPublish).toHaveBeenCalledWith(['wp-content']);
    expect(whitelabel.publish).toHaveBeenCalledWith('wl-content');
    expect(ftpHtml.publish).toHaveBeenCalledWith('ftp-content');
    expect(result).toEqual([
      { id: 'wp-content', success: true },
      { id: 'wl-content', success: true, data: { id: 'wl-content' } },
      { id: 'ftp-content', success: false, error: 'ftp disabled' },
    ]);
  });

  it('blocks duplicate FTP remote pages in the same bulk publish', async () => {
    const { service, contents, sites, ftpHtml } = createSubject();
    contents.findByIds.mockResolvedValue([
      {
        id: 'ftp-content-1',
        site_id: 'site-ftp',
        ftp_remote_page_id: 'remote-page-1',
      },
      {
        id: 'ftp-content-2',
        site_id: 'site-ftp',
        ftp_remote_page_id: 'remote-page-1',
      },
    ]);
    sites.findById.mockResolvedValue({
      id: 'site-ftp',
      name: 'FTP',
      integration_type: 'ftp_html',
    });
    ftpHtml.publish.mockResolvedValue({ id: 'ftp-content-1' });

    const result = await service.bulkPublish(['ftp-content-1', 'ftp-content-2']);

    expect(ftpHtml.publish).toHaveBeenCalledTimes(1);
    expect(ftpHtml.publish).toHaveBeenCalledWith('ftp-content-1');
    expect(result).toEqual([
      {
        id: 'ftp-content-2',
        success: false,
        error: 'Duas paginas do lote apontam para o mesmo arquivo FTP.',
      },
      { id: 'ftp-content-1', success: true, data: { id: 'ftp-content-1' } },
    ]);
  });
});
