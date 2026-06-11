import { api } from '@/lib/api';
import TemplatePageClient from './_components/TemplatePageClient';
import TemplatePageLoader from './_components/TemplatePageLoader';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TemplatePage({ params }: Props) {
  const { id } = await params;

  let service = null;
  try {
    service = await api.getService(id);
  } catch (error) {
    console.error(`Failed to preload template service ${id}`, error);
  }

  if (!service) return <TemplatePageLoader serviceId={id} />;

  return <TemplatePageClient service={service} />;
}
