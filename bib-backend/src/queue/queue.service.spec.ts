import { QueueService } from './queue.service';

function queryBuilder(result: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    then: jest.fn((resolve, reject) =>
      Promise.resolve(result).then(resolve, reject),
    ),
  };
}

describe('QueueService', () => {
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
