import { Content, ContentSummary } from './types';

type ReviewStatus = ContentSummary['status'];

export function scaleReviewHref(input?: {
  siteId?: string | null;
  status?: ReviewStatus;
  serviceId?: string | null;
  city?: string | null;
}) {
  const qs = new URLSearchParams({ view: 'review' });
  if (input?.status) qs.set('review_status', input.status);
  if (input?.siteId) qs.set('site_id', input.siteId);
  if (input?.serviceId) qs.set('service_id', input.serviceId);
  if (input?.city) qs.set('city', input.city);
  return `/scale?${qs.toString()}`;
}

export function scaleReviewHrefForContent(content: Content | ContentSummary) {
  return scaleReviewHref({
    siteId: content.site_id,
    status: content.status,
    serviceId: content.service_id,
    city: content.city,
  });
}
