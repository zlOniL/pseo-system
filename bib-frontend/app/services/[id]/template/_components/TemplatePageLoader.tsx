'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Service } from '@/lib/types';
import TemplatePageClient from './TemplatePageClient';

interface Props {
  serviceId: string;
}

export default function TemplatePageLoader({ serviceId }: Props) {
  const [service, setService] = useState<Service | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    api
      .getService(serviceId)
      .then((data) => {
        if (active) setService(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Nao foi possivel carregar este servico.',
        );
      });

    return () => {
      active = false;
    };
  }, [serviceId]);

  if (service) return <TemplatePageClient service={service} />;

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href="/services" className="bib-back">
          Voltar aos servicos
        </Link>

        <div className="bib-card">
          <h1 className="bib-title mb-3">Templates do servico</h1>
          {error ? (
            <>
              <p className="text-sm text-red-600">
                Nao foi possivel carregar este servico.
              </p>
              <p className="mt-2 break-words text-xs text-gray-500">{error}</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">A carregar servico...</p>
          )}
        </div>
      </div>
    </div>
  );
}
