import { redirect } from 'next/navigation';

export default async function ContentsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: 'review' });
  for (const key of ['site_id', 'service_id', 'city']) {
    const value = params?.[key];
    if (typeof value === 'string') query.set(key, value);
  }
  const status = params?.status;
  if (typeof status === 'string') query.set('review_status', status);
  redirect(`/scale?${query}`);
}
