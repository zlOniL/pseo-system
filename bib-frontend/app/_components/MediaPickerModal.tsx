'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { MediaItem } from '@/lib/types';

interface MediaPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'video' | 'images';
  onConfirmVideo: (url: string) => void;
  onConfirmImages: (urls: string[]) => void;
  initialVideoUrl?: string;
  initialImages?: string[];
}

export default function MediaPickerModal({
  isOpen,
  onClose,
  mode,
  onConfirmVideo,
  onConfirmImages,
  initialVideoUrl,
  initialImages,
}: MediaPickerModalProps) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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
    api
      .listMedia(mode === 'video' ? 'video' : 'image', p, q)
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
      if (prev.length >= 8) return prev;
      return [...prev, url];
    });
  }

  function handleConfirm() {
    if (mode === 'video') {
      if (selectedVideo) onConfirmVideo(selectedVideo);
    } else {
      onConfirmImages(selectedImages);
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
                  <button
                    key={item.id}
                    onClick={() => handleImageClick(item.url)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
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
                );
              })}
            </div>
          )}
        </div>

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
              {selectedImages.length} / 8 imagens selecionadas
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
