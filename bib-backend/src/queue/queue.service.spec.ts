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
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
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

  it('keeps active items at the top of the global queue', async () => {
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

    expect(dataQuery.order).toHaveBeenNthCalledWith(1, 'status', {
      ascending: false,
    });
    expect(dataQuery.order).toHaveBeenNthCalledWith(2, 'created_at', {
      ascending: false,
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

  it('enqueues a main-page generation without a city', async () => {
    const serviceQuery = queryBuilder({ data: { site_id: 'site-1' }, error: null });
    const activeJobsQuery = queryBuilder({ data: [], error: null });
    const insertQuery = queryBuilder({
      data: [{ id: 'main-job', job_type: 'template', city: null }],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(activeJobsQuery)
        .mockReturnValueOnce(insertQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    await service.enqueueTemplates('service-1', [{ is_main_page: true }]);

    expect(activeJobsQuery.eq).toHaveBeenCalledWith(
      'payload->>is_main_page',
      'true',
    );
    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        service_id: 'service-1',
        city: null,
        job_type: 'template',
        payload: expect.objectContaining({ is_main_page: true }),
      }),
    ]);
  });

  it('rejects another active main-page generation for the same service', async () => {
    const serviceQuery = queryBuilder({ data: { site_id: 'site-1' }, error: null });
    const activeJobsQuery = queryBuilder({
      data: [{ payload: { is_main_page: true } }],
      error: null,
    });
    const client = {
      from: jest
        .fn()
        .mockReturnValueOnce(serviceQuery)
        .mockReturnValueOnce(activeJobsQuery),
    };
    const service = new QueueService(
      { getClient: jest.fn().mockReturnValue(client) } as never,
      {} as never,
    );

    await expect(
      service.enqueueTemplates('service-1', [{ is_main_page: true }]),
    ).rejects.toMatchObject({ status: 409 });
    expect(client.from).toHaveBeenCalledTimes(2);
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
  it('rejects a failed completion update instead of reporting success', async () => {
    const query = queryBuilder({ data: null, error: { message: 'database unavailable' } });
    const service = new QueueService({ getClient: () => ({ from: () => query }) } as never, {} as never);
    await expect(service.markDone('job-1', 'content-1', 'claim-1')).rejects.toThrow('database unavailable');
  });

  it('rejects completion of a missing job', async () => {
    const query = queryBuilder({ data: [], error: null });
    const service = new QueueService({ getClient: () => ({ from: () => query }) } as never, {} as never);
    await expect(service.markDone('missing', 'content-1', 'claim-1')).rejects.toThrow('Trabalho não encontrado');
  });

  it('returns the linked editorial state even for old published pages', async () => {
    const queries = [
      queryBuilder({ count: 1, error: null }),
      queryBuilder({ data: [{ id: 'job-1', service_id: 'service-1', content_id: 'content-1', status: 'done' }], error: null }),
      queryBuilder({ data: [{ id: 'service-1', name: 'Loiça', site_id: 'site-1' }], error: null }),
      queryBuilder({ data: [{ id: 'content-1', status: 'published', created_at: '2020-01-01' }], error: null }),
    ];
    const service = new QueueService({ getClient: () => ({ from: () => queries.shift() }) } as never, {} as never);
    const result = await service.findAll({ status: 'done' });
    expect(result.data[0].content).toEqual({ id: 'content-1', status: 'published', created_at: '2020-01-01' });
  });

  it('uses creation dates for completed lists and all status counters', async () => {
    const queries: ReturnType<typeof queryBuilder>[] = [];
    const service = new QueueService({ getClient: () => ({ from: () => {
      const query = queryBuilder({ count: 0, error: null });
      queries.push(query);
      return query;
    } }) } as never, {} as never);
    await service.findAll({ status: 'done', from: '2026-10-01', to: '2026-10-24' });
    await service.getStats({ from: '2026-10-01', to: '2026-10-24' });
    expect(queries).toHaveLength(5);
    for (const query of queries) {
      expect(query.gte).toHaveBeenCalledWith('created_at', '2026-10-01');
      expect(query.lte).toHaveBeenCalledWith('created_at', '2026-10-24');
    }
  });

  it('does not turn a failed counter query into a zero count', async () => {
    const query = queryBuilder({ count: null, error: { message: 'count unavailable' } });
    const service = new QueueService({ getClient: () => ({ from: () => query }) } as never, {} as never);
    await expect(service.getStats()).rejects.toThrow('count unavailable');
  });

});
