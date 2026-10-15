import { QueueService } from './queue.service';

function queryBuilder(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: jest.fn((resolve, reject) =>
      Promise.resolve(result).then(resolve, reject),
    ),
  };
}

describe('QueueService', () => {
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
});
