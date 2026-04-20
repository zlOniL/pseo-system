import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import TemplatePageClient from './_components/TemplatePageClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TemplatePage({ params }: Props) {
  const { id } = await params;

  let service;
  try {
    service = await api.getService(id);
  } catch {
    notFound();
  }

  return <TemplatePageClient service={service} />;
}
