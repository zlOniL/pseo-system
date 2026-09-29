import { Content } from '../contents/contents.service';

export interface ContentPublisher {
  publish(contentId: string): Promise<Content>;
}
