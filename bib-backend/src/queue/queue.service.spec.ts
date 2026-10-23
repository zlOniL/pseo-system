import { QueueService } from './queue.service';

function queryBuilder(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    then: jest.fn((resolve, reject) =>
      Promise.resolve(result).then(resolve, reject),
    ),
  };
}

describe('QueueService', () => {
  it('skips existing locality pages when enqueueing without recreation', async () => {
    const serviceQuery = queryBuilder({
      data: { site_id: 'site-1' },
      error: null,
    });
    const cleanupQuery = queryBuilder({ data: null, error: null });
    const activeQuery = queryBuilder({ data: [], error: null });
    const insertQuery = queryBuilder({
      data: [{ id: 'job-1', city: 'Porto' }],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(cleanupQuery)
        .mockReturnValueOnce(activeQuery)
        .mockReturnValueOnce(insertQuery),
    };
    const contents = {
      findLatestMainPageByService: jest.fn().mockResolvedValue({ id: 'main-1' }),
      findByServiceAndCities: jest.fn().mockResolvedValue([
        { id: 'content-1', city: 'Alcântara', status: 'published' },
      ]),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      contents as never,
    );

    const result = await service.enqueue('service-1', ['Alcântara', 'Porto']);

    expect(result).toEqual([{ id: 'job-1', city: 'Porto' }]);
    expect(contents.findByServiceAndCities).toHaveBeenCalledWith('service-1', [
      'Alcântara',
      'Porto',
    ]);
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({ city: 'Porto', payload: null }),
    ]);
  });

  it('marks explicitly recreated locality pages for the worker', async () => {
    const serviceQuery = queryBuilder({
      data: { site_id: 'site-1' },
      error: null,
    });
    const cleanupQuery = queryBuilder({ data: null, error: null });
    const activeQuery = queryBuilder({ data: [], error: null });
    const insertQuery = queryBuilder({
      data: [{ id: 'job-1', city: 'Alcântara' }],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(cleanupQuery)
        .mockReturnValueOnce(activeQuery)
        .mockReturnValueOnce(insertQuery),
    };
    const contents = {
      findLatestMainPageByService: jest.fn().mockResolvedValue({ id: 'main-1' }),
      findByServiceAndCities: jest.fn().mockResolvedValue([
        { id: 'content-1', city: 'Alcântara', status: 'published' },
      ]),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      contents as never,
    );

    await service.enqueue('service-1', ['Alcântara'], 'ai', undefined, 'recreate');

    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({ city: 'Alcântara', payload: { recreate: true } }),
    ]);
  });

  it('splits bulk retries into URL-safe batches', async () => {
    const ids = Array.from({ length: 26 }, (_, index) => `queue-${index}`);
    const firstQuery = queryBuilder({ data: [{ id: ids[0] }], error: null });
    const secondQuery = queryBuilder({ data: [{ id: ids[25] }], error: null });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(firstQuery)
        .mockReturnValueOnce(secondQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    const result = await service.bulkRetry(ids);

    expect(result).toEqual([{ id: ids[0] }, { id: ids[25] }]);
    expect(firstQuery.in).toHaveBeenCalledWith('id', ids.slice(0, 25));
    expect(secondQuery.in).toHaveBeenCalledWith('id', ids.slice(25));
  });

  it('includes processing in the pending-only filter and orders it first', async () => {
    const countQuery = queryBuilder({ count: 2, error: null });
    const dataQuery = queryBuilder({ data: [], error: null });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(dataQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    await service.findAll({ status: 'pending' });

    expect(countQuery.in).toHaveBeenCalledWith('status', [
      'pending',
      'processing',
    ]);
    expect(dataQuery.in).toHaveBeenCalledWith('status', [
      'pending',
      'processing',
    ]);
    expect(dataQuery.order).toHaveBeenNthCalledWith(1, 'status', {
      ascending: false,
    });
    expect(dataQuery.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
    });
  });

  it('keeps the global queue in database creation order', async () => {
    const countQuery = queryBuilder({ count: 1, error: null });
    const dataQuery = queryBuilder({ data: [], error: null });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(countQuery)
        .mockReturnValueOnce(dataQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    await service.findAll({ queue_order: true });

    expect(dataQuery.order).toHaveBeenCalledWith('created_at', {
      ascending: true,
    });
  });

  it('enqueues template jobs with their generation payload', async () => {
    const serviceQuery = queryBuilder({
      data: { site_id: 'site-1' },
      error: null,
    });
    const insertQuery = queryBuilder({
      data: [{ id: 'job-1', job_type: 'template' }],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(insertQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    const result = await service.enqueueTemplates('service-1', [
      { base_city: 'Porto', label: 'Variação Porto' },
    ]);

    expect(result).toEqual([{ id: 'job-1', job_type: 'template' }]);
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        service_id: 'service-1',
        site_id: 'site-1',
        city: 'Porto',
        job_type: 'template',
        payload: expect.objectContaining({ label: 'Variação Porto' }),
      }),
    ]);
  });

  it('keeps template jobs for the same city in the queue', async () => {
    const serviceQuery = queryBuilder({
      data: { site_id: 'site-1' },
      error: null,
    });
    const insertQuery = queryBuilder({
      data: [
        { id: 'job-1', job_type: 'template' },
        { id: 'job-2', job_type: 'template' },
      ],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(insertQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    const result = await service.enqueueTemplates('service-1', [
      { base_city: 'Porto', label: 'Variação A' },
      { base_city: 'Porto', label: 'Variação B' },
    ]);

    expect(result).toHaveLength(2);
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        city: 'Porto',
        payload: expect.objectContaining({ label: 'Variação A' }),
      }),
      expect.objectContaining({
        city: 'Porto',
        payload: expect.objectContaining({ label: 'Variação B' }),
      }),
    ]);
  });
});
