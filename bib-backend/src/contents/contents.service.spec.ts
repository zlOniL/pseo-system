import { ContentsService, type Content } from './contents.service';

function queryBuilder(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: jest.fn(
      (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
    ),
  };
}

describe('ContentsService main page lookup', () => {
  it('finds a published production page without a service_id', async () => {
    const typedQuery = queryBuilder({ data: null, error: null });
    const linkedQuery = queryBuilder({ data: null, error: null });
    const serviceQuery = queryBuilder({
      data: { name: 'Reparação de Estores', site_id: 'site-1' },
      error: null,
    });
    const productionPage = {
      id: 'content-1',
      status: 'published',
      service: 'reparação de estores',
      service_id: null,
      site_id: 'site-1',
      city: '',
    } as Content;
    const unlinkedQuery = queryBuilder({
      data: productionPage,
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(typedQuery)
        .mockReturnValueOnce(linkedQuery)
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(unlinkedQuery),
    };
    const service = new ContentsService({
      getClient: jest.fn().mockReturnValue(client),
    } as never);

    const result = await service.findLatestMainPageByService(
      'service-1',
      'published',
    );

    expect(result).toBe(productionPage);
    expect(unlinkedQuery.is).toHaveBeenCalledWith('service_id', null);
    expect(unlinkedQuery.ilike).toHaveBeenCalledWith(
      'service',
      'Reparação de Estores',
    );
    expect(unlinkedQuery.eq).toHaveBeenCalledWith('city', '');
    expect(unlinkedQuery.eq).toHaveBeenCalledWith('site_id', 'site-1');
    expect(unlinkedQuery.eq).toHaveBeenCalledWith('status', 'published');
  });

  it('accepts a published main page from the same site and WordPress category', async () => {
    const typedQuery = queryBuilder({ data: null, error: null });
    const linkedQuery = queryBuilder({ data: null, error: null });
    const serviceQuery = queryBuilder({
      data: {
        name: 'Reparação de Estores',
        site_id: 'site-1',
        wordpress_category: 'Estores',
      },
      error: null,
    });
    const unlinkedQuery = queryBuilder({ data: null, error: null });
    const relatedServicesQuery = queryBuilder({
      data: [{ id: 'related-service-1' }],
      error: null,
    });
    const productionPage = {
      id: 'content-1',
      status: 'published',
      service: 'Reparamos Estores',
      service_id: 'related-service-1',
      site_id: 'site-1',
      city: '',
      external_page_type: 'service',
    } as Content;
    const categoryPageQuery = queryBuilder({
      data: productionPage,
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(typedQuery)
        .mockReturnValueOnce(linkedQuery)
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(unlinkedQuery)
        .mockReturnValueOnce(relatedServicesQuery)
        .mockReturnValueOnce(categoryPageQuery),
    };
    const service = new ContentsService({
      getClient: jest.fn().mockReturnValue(client),
    } as never);

    const result = await service.findLatestMainPageByService(
      'service-1',
      'published',
    );

    expect(result).toBe(productionPage);
    expect(relatedServicesQuery.eq).toHaveBeenCalledWith(
      'wordpress_category',
      'Estores',
    );
    expect(relatedServicesQuery.eq).toHaveBeenCalledWith('site_id', 'site-1');
    expect(categoryPageQuery.in).toHaveBeenCalledWith('service_id', [
      'related-service-1',
    ]);
    expect(categoryPageQuery.eq).toHaveBeenCalledWith(
      'external_page_type',
      'service',
    );
    expect(categoryPageQuery.eq).toHaveBeenCalledWith('status', 'published');
  });
});
