"use client";

import { useEffect, useRef } from "react";

function buildPreviewHtml(contentHtml: string, videoUrl?: string, generationMode?: 'ai' | 'template'): string {
  const video = videoUrl?.trim() ?? "";
  const videoBlock = video
    ? `<section style="margin:0;padding:0"><video src="${video}" style="width:100%;height:auto;display:block;" autoplay loop muted controls></video></section>`
    : "";

  const body = generationMode === 'template'
    ? `${videoBlock}${contentHtml}`
    : `${videoBlock}<div style="max-width:900px;margin:0 auto;padding:20px 20px 40px">${contentHtml}</div>`;

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

interface Props {
  html: string | null;
  videoUrl?: string;
  loading: boolean;
  generationMode?: 'ai' | 'template';
}

export function PreviewPane({ html, videoUrl, loading, generationMode }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const onLoad = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight;
        if (h) iframe.style.height = `${h + 40}px`;
      } catch {
        // sandboxed
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
        <div className="h-48 bg-gray-100" />
        <div className="p-8 space-y-4">
          <div className="h-6 bg-gray-100 rounded-lg w-2/3" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-5/6" />
            <div className="h-3 bg-gray-100 rounded w-4/6" />
          </div>
          <div className="h-5 bg-gray-100 rounded-lg w-1/2 mt-6" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-11/12" />
          </div>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">Nenhum conteúdo gerado</p>
        <p className="text-xs mt-1">Preenche o formulário e clica em Gerar Página</p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin allow-scripts"
      srcDoc={buildPreviewHtml(html, videoUrl, generationMode)}
      className="w-full bg-white rounded-xl border border-gray-200 shadow-sm"
      style={{ minHeight: 600 }}
      title="Preview da página"
    />
  );
}
