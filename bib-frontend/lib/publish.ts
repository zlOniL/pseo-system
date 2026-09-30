import { api } from './api';
import { Content } from './types';

const REMOTE_CHANGED_MESSAGE = 'Arquivo remoto mudou desde a ultima importacao';

export async function publishContentWithRemoteConfirm(id: string): Promise<Content> {
  try {
    return await api.publishContent(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes(REMOTE_CHANGED_MESSAGE)) throw err;

    const confirmed = window.confirm(
      'O arquivo remoto mudou desde a ultima importacao. Publicar mesmo assim vai sobrescrever o HTML que esta agora no FTP. Deseja continuar?',
    );
    if (!confirmed) throw new Error('Publicacao cancelada.');

    return api.publishContent(id, { forceRemoteConflict: true });
  }
}
