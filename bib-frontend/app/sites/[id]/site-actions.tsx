'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

export default function SiteActions({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false);

  async function refreshBlueprints() {
    setLoading(true);
    try {
      await api.refreshWhitelabelBlueprints(siteId);
      toast.success('Blueprints atualizados.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function testConnection() {
    setLoading(true);
    try {
      await api.testWhitelabelApi(siteId);
      toast.success('Conexão OK.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <button disabled={loading} onClick={testConnection} className="bib-btn bib-btn-secondary text-xs">
        Testar
      </button>
      <button disabled={loading} onClick={refreshBlueprints} className="bib-btn bib-btn-primary text-xs">
        Atualizar blueprints
      </button>
    </div>
  );
}
