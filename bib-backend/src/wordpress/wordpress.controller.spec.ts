import { WordPressController } from './wordpress.controller';

describe('WordPressController', () => {
  function createController() {
    const publishingService = {
      publish: jest.fn().mockResolvedValue({ id: 'content-1' }),
      bulkPublish: jest.fn().mockResolvedValue([
        { id: 'content-1', success: true },
        { id: 'content-2', success: false, error: 'Falhou' },
      ]),
    };
    const contentsService = {
      bulkUpdateStatus: jest.fn(),
      bulkDelete: jest.fn(),
    };

    return {
      controller: new WordPressController(
        publishingService as never,
        contentsService as never,
      ),
      publishingService,
    };
  }

  it('delegates individual publish to PublishingService', async () => {
    const { controller, publishingService } = createController();

    await controller.publish('content-1');

    expect(publishingService.publish).toHaveBeenCalledWith('content-1');
  });

  it('delegates bulk publish to PublishingService', async () => {
    const { controller, publishingService } = createController();

    const result = await controller.bulkPublish({
      ids: ['content-1', 'content-2'],
    });

    expect(publishingService.bulkPublish).toHaveBeenCalledWith([
      'content-1',
      'content-2',
    ]);
    expect(result).toEqual([
      { id: 'content-1', success: true },
      { id: 'content-2', success: false, error: 'Falhou' },
    ]);
  });
});
