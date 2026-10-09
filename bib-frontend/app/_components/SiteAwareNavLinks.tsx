'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const STORAGE_KEY = 'bib-selected-site-id';

function withSiteId(path: string, siteId: string): string {
  if (!siteId || (path !== '/services' && path !== '/scale'))
    return path;
  return `${path}?site_id=${encodeURIComponent(siteId)}`;
}

export default function SiteAwareNavLinks() {
  const searchParams = useSearchParams();
  const currentSiteId = searchParams.get('site_id') ?? '';
  const [siteId, setSiteId] = useState(currentSiteId);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
    setSiteId(currentSiteId || stored);
  }, [currentSiteId]);

  useEffect(() => {
    function refreshFromStorage() {
      setSiteId(window.localStorage.getItem(STORAGE_KEY) ?? '');
    }

    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) refreshFromStorage();
    }

    function onSelected(event: Event) {
      const nextSiteId =
        (event as CustomEvent<{ siteId: string }>).detail?.siteId ?? '';
      setSiteId(nextSiteId);
    }

    window.addEventListener('storage', onStorage);
    window.addEventListener('bib-site-selected', onSelected);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('bib-site-selected', onSelected);
    };
  }, []);

  return (
    <>
      <div className="h-4 w-px bg-gray-200" />
      <Link
        href="/sites"
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Sites
      </Link>
      <Link
        href={withSiteId('/services', siteId)}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Serviços
      </Link>
      <Link
        href={withSiteId('/scale', siteId)}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Producao
      </Link>
      <Link
        href="/generate"
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Gerar página
      </Link>
    </>
  );
}
