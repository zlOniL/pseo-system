import { Content } from '../contents/contents.service';

export interface PublishOptions {
  forceRemoteConflict?: boolean;
}

export interface ContentPublisher {
  publish(contentId: string, options?: PublishOptions): Promise<Content>;
}
