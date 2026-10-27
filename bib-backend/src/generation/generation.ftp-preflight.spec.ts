import { GenerationService } from './generation.service';

describe('FTP generation preflight', () => {
  it.each(['generate', 'regenerate'] as const)('%s rejects an invalid template before generating content', async (operation) => {
    const prepare = jest.fn().mockRejectedValue(new Error('placeholder pendente: {{UNKNOWN}}'));
    const subject = new GenerationService(
      {} as never, {} as never,
      { findById: async () => ({ site_id: 'site', service_id: 'service' }) } as never,
      {} as never,
      { findById: async () => ({ integration_type: 'ftp_html' }) } as never,
      {} as never, {} as never, {} as never,
      { prepare } as never,
      { findById: async () => ({ id: 'service', site_id: 'site', name: 'Loica' }) } as never,
    );
    const build = jest.spyOn(subject, 'buildHtml');
    await expect(subject[operation]({
      content_id: 'content', service_id: 'service', site_id: 'site',
      service: 'Loica', main_keyword: 'Loica',
    })).rejects.toThrow('placeholder pendente');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(build).not.toHaveBeenCalled();
  });
});
