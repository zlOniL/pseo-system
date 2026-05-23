'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Site } from '@/lib/types';

const STORAGE_KEY = 'bib-selected-site-id';

function pathSupportsSiteFilter(pathname: string): boolean {
  return pathname === '/services' || pathname === '/contents' || pathname === '/services/new';
}

export default function SiteSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedId, setSelectedId] = useState('');

  const currentSiteId = searchParams.get('site_id') ?? '';

  useEffect(() => {
    let cancelled = false;

    api
      .listSites()
      .then((loadedSites) => {
        if (cancelled) return;

        setSites(loadedSites);

        const stored = window.localStorage.getItem(STORAGE_KEY) ?? '';
        const nextSiteId =
          loadedSites.find((site) => site.id === currentSiteId)?.id ??
          loadedSites.find((site) => site.id === stored)?.id ??
          loadedSites[0]?.id ??
          '';

        setSelectedId(nextSiteId);

        if (!nextSiteId) {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }

        window.localStorage.setItem(STORAGE_KEY, nextSiteId);

        if (pathSupportsSiteFilter(pathname) && currentSiteId !== nextSiteId) {
          const next = new URLSearchParams(searchParamsString);
          next.set('site_id', nextSiteId);
          router.replace(`${pathname}?${next.toString()}`);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSites([]);
          setSelectedId('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentSiteId, pathname, router, searchParamsString]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedId) ?? null,
    [sites, selectedId],
  );

  function applySite(id: string) {
    if (!id) return;

    setSelectedId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    window.dispatchEvent(new CustomEvent('bib-site-selected', { detail: { siteId: id } }));

    const next = new URLSearchParams(searchParamsString);
    next.set('site_id', id);

    if (pathSupportsSiteFilter(pathname)) {
      const qs = next.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ''}`);
    } else {
      router.push(`/sites/${id}`);
    }
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => applySite(e.target.value)}
      className="h-8 max-w-[220px] rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none hover:border-gray-300"
      title={selectedSite ? selectedSite.domain : 'Selecionar site'}
      disabled={sites.length === 0}
    >
      {sites.length === 0 ? (
        <option value="">Nenhum site</option>
      ) : (
        sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))
      )}
    </select>
  );
}
