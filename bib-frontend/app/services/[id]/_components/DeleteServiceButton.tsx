'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Props {
  serviceId: string;
  serviceName: string;
}

export default function DeleteServiceButton({ serviceId, serviceName }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await api.deleteService(serviceId);
      toast.success('Serviço excluído com sucesso.');
      router.push('/services');
      router.refresh();
    } catch (err) {
      const msg = (err as Error).message;
      // Backend returns 409 Conflict when there are linked pages
      toast.error(msg);
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full text-sm text-red-600 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-50 transition-colors"
      >
        Excluir serviço
      </button>
    );
  }

  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
      <p className="text-sm text-red-700 font-medium">
        Excluir &quot;{serviceName}&quot;?
      </p>
      <p className="text-xs text-red-600">
        Esta acção é irreversível. Serão eliminados os templates, as secções da biblioteca e os itens de fila vinculados a este serviço. Não é possível excluir se existirem páginas geradas associadas.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleDelete}
          className="flex-1 text-sm bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'A excluir...' : 'Confirmar exclusão'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => setConfirming(false)}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-100 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
