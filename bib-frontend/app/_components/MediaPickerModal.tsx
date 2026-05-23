'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { MediaItem } from '@/lib/types';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'video' | 'images';
  source?: 'wordpress' | 'supabase';
  siteId?: string;
  maxImages?: number;
  onConfirmVideo: (url: string) => void;
  onConfirmImages: (urls: string[]) => void;
  onConfirmImageItems?: (items: MediaItem[]) => void;
  initialVideoUrl?: string;
  initialImages?: string[];
}

interface PendingUpload {
  id: string;
  file: File;
  title: string;
  alt: string;
}

export default function MediaPickerModal({
  isOpen,
  onClose,
  mode,
  source = 'wordpress',
  siteId,
  maxImages = 8,
  onConfirmVideo,
  onConfirmImages,
  onConfirmImageItems,
  initialVideoUrl,
  initialImages,
}: MediaPickerModalProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingAlt, setEditingAlt] = useState('');
  const [editingError, setEditingError] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(
    mode === 'video' ? (initialVideoUrl ?? null) : null,
  );
  const [selectedImages, setSelectedImages] = useState<string[]>(
    mode === 'images' ? (initialImages ?? []) : [],
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    loadMedia(1, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  function loadMedia(p: number, q: string) {
    setLoading(true);
    const request =
      source === 'supabase' && mode === 'images'
        ? api.listSupabaseMedia('image', p, q, siteId)
        : api.listMedia(mode === 'video' ? 'video' : 'image', p, q, siteId);

    request
      .then((res) => {
        setItems(res.items);
        setTotalPages(res.total_pages);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadMedia(1, value);
    }, 300);
  }

  function handlePageChange(p: number) {
    setPage(p);
    loadMedia(p, search);
  }

  function handleVideoClick(url: string) {
    setSelectedVideo((prev) => (prev === url ? null : url));
  }

  function handleImageClick(url: string) {
    setSelectedImages((prev) => {
      const idx = prev.indexOf(url);
      if (idx !== -1) {
        return prev.filter((u) => u !== url);
      }
      if (prev.length >= maxImages) return prev;
      if (maxImages === 1) return [url];
      return [...prev, url];
    });
  }

  function handleConfirm() {
    if (mode === 'video') {
      if (selectedVideo) onConfirmVideo(selectedVideo);
    } else {
      onConfirmImages(selectedImages);
      onConfirmImageItems?.(
        selectedImages
          .map((url) => items.find((item) => item.url === url))
          .filter((item): item is MediaItem => Boolean(item)),
      );
    }
  }

  function cleanFileTitle(filename: string) {
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Imagem';
  }

  function handleFilesSelected(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0 || source !== 'supabase' || mode !== 'images') return;
    setUploadError('');
    setPendingUploads((prev) => [
      ...prev,
      ...selectedFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        title: cleanFileTitle(file.name),
        alt: '',
      })),
    ]);
  }

  function updatePendingUpload(id: string, field: 'title' | 'alt', value: string) {
    setPendingUploads((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  function removePendingUpload(id: string) {
    setPendingUploads((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleUploadPending() {
    if (pendingUploads.length === 0 || source !== 'supabase' || mode !== 'images') return;
    setUploading(true);
    setUploadError('');
    try {
      const assets = await api.uploadSupabaseMedia({
        files: pendingUploads.map((item) => ({
          file: item.file,
          title: item.title.trim() || cleanFileTitle(item.file.name),
          alt: item.alt.trim() || undefined,
        })),
        site_id: siteId,
      });
      const newItems: MediaItem[] = assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        url: asset.public_url,
        mime_type: asset.mime_type,
        date: asset.created_at,
        thumbnail: asset.public_url,
        alt: asset.alt,
      }));
      setItems((prev) => [...newItems, ...prev]);
      setSelectedImages((prev) => {
        if (maxImages === 1) return newItems[0] ? [newItems[0].url] : prev;
        const next = [...prev];
        for (const item of newItems) {
          if (next.length >= maxImages) break;
          if (!next.includes(item.url)) next.push(item.url);
        }
        return next;
      });
      setPendingUploads([]);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function openEditor(item: MediaItem) {
    setEditingItem(item);
    setEditingTitle(item.title ?? '');
    setEditingAlt(item.alt ?? '');
    setEditingError('');
  }

  async function saveEditingItem() {
    if (!editingItem) return;
    setEditingSaving(true);
    setEditingError('');
    try {
      const asset = await api.updateSupabaseMedia(String(editingItem.id), {
        title: editingTitle.trim() || editingItem.title,
        alt: editingAlt.trim(),
      });
      setItems((prev) =>
        prev.map((item) =>
          String(item.id) === asset.id
            ? { ...item, title: asset.title, alt: asset.alt }
            : item,
        ),
      );
      setEditingItem(null);
    } catch (err) {
      setEditingError((err as Error).message);
    } finally {
      setEditingSaving(false);
    }
  }

  async function deleteItem(item: MediaItem) {
    if (!window.confirm(`Excluir "${item.title}" da biblioteca?`)) return;
    try {
      await api.deleteSupabaseMedia(String(item.id));
      setItems((prev) => prev.filter((current) => String(current.id) !== String(item.id)));
      setSelectedImages((prev) => prev.filter((url) => url !== item.url));
      if (editingItem && String(editingItem.id) === String(item.id)) setEditingItem(null);
    } catch (err) {
      setUploadError((err as Error).message);
    }
  }

  function getImageBadge(url: string): number | null {
    const idx = selectedImages.indexOf(url);
    return idx !== -1 ? idx + 1 : null;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">
            {mode === 'video' ? 'Selecionar Vídeo' : 'Selecionar Imagens'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Pesquisar na biblioteca..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
          />
          {source === 'supabase' && mode === 'images' && (
            <div className="mt-3 space-y-3">
              <label className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors text-center cursor-pointer">
                Selecionar ficheiros
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  disabled={uploading}
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.currentTarget.value = '';
                  }}
                  className="hidden"
                />
              </label>
              {pendingUploads.length > 0 && (
                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  {pendingUploads.map((item) => (
                    <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updatePendingUpload(item.id, 'title', e.target.value)}
                        placeholder="Título do ficheiro"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
                      />
                      <input
                        type="text"
                        value={item.alt}
                        onChange={(e) => updatePendingUpload(item.id, 'alt', e.target.value)}
                        placeholder="Alt da imagem"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingUpload(item.id)}
                        className="text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-white"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void handleUploadPending()}
                    className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    {uploading ? 'A enviar...' : `Enviar ${pendingUploads.length} imagem(ns)`}
                  </button>
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-red-500">{uploadError}</p>
              )}
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              Nenhum ficheiro encontrado.
            </p>
          ) : mode === 'video' ? (
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => {
                const isSelected = selectedVideo === item.url;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleVideoClick(item.url)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all bg-black ${
                      isSelected
                        ? 'border-gray-900 ring-2 ring-gray-900/20'
                        : 'border-transparent hover:border-gray-400'
                    }`}
                  >
                    {item.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={item.url}
                        preload="metadata"
                        muted
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      <span className="text-white text-xs mt-1 px-2 truncate max-w-full">
                        {item.title || item.url.split('/').pop()}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center shadow">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {items.map((item) => {
                const badge = getImageBadge(item.url);
                const isSelected = badge !== null;
                const thumb = item.thumbnail ?? item.url;
                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => handleImageClick(item.url)}
                      className={`relative aspect-square w-full rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-gray-900 ring-2 ring-gray-900/20'
                          : 'border-transparent hover:border-gray-300'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center">
                          {badge}
                        </span>
                      )}
                    </button>
                    {source === 'supabase' && (
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteItem(item)}
                          className="text-[11px] px-2 py-1 rounded border border-red-100 text-red-600 hover:bg-red-50"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {editingItem && (
          <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder="Título do ficheiro"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
              />
              <input
                type="text"
                value={editingAlt}
                onChange={(e) => setEditingAlt(e.target.value)}
                placeholder="Alt da imagem"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-gray-400"
              />
              <button
                type="button"
                disabled={editingSaving}
                onClick={() => void saveEditingItem()}
                className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
              >
                {editingSaving ? 'A guardar...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-white"
              >
                Cancelar
              </button>
            </div>
            {editingError && <p className="mt-2 text-xs text-red-500">{editingError}</p>}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-gray-100">
            <button
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
              className="text-sm px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              ← Anterior
            </button>
            <span className="text-xs text-gray-500">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
              className="text-sm px-3 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Próximo →
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
          {mode === 'images' ? (
            <span className="text-sm text-gray-500">
              {selectedImages.length} / {maxImages} imagens selecionadas
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              {selectedVideo ? '1 vídeo selecionado' : 'Nenhum vídeo selecionado'}
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={mode === 'video' ? !selectedVideo : selectedImages.length === 0}
              className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
