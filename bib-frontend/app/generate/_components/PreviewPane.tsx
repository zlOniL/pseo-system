'use client';

import { useEffect, useRef, useState } from 'react';
import {
  buildFullDocumentPreviewHtml,
  PreviewDevice,
  previewDeviceWidth,
} from '@/lib/full-document-preview';

function escapeScriptText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function instrumentSections(contentHtml: string, interactive: boolean): string {
  if (!interactive) return contentHtml;

  const opened = contentHtml.replace(
    /<!--\s*BIB_SECTION:([a-z0-9_/-]+)\s*-->/gi,
    (_match, key: string) =>
      `<section class="bib-preview-section" data-bib-section="${key}">`,
  );

  return opened.replace(
    /<!--\s*\/BIB_SECTION:[a-z0-9_/-]+\s*-->/gi,
    '</section>',
  );
}

function interactiveStyles(): string {
  return `.bib-preview-section{position:relative;border:1px solid transparent;border-radius:8px;padding:8px;margin:4px 0;transition:border-color .15s ease,box-shadow .15s ease}.bib-preview-section:hover,.bib-preview-section.is-selected{border-color:#111;box-shadow:0 0 0 3px rgba(17,17,17,.08)}.bib-preview-section-toolbar{position:absolute;top:6px;right:6px;z-index:20;display:none;gap:4px}.bib-preview-section:hover>.bib-preview-section-toolbar,.bib-preview-section.is-selected>.bib-preview-section-toolbar{display:flex}.bib-preview-section-button{border:1px solid #111;background:#111;color:#fff;border-radius:6px;padding:4px 7px;font:600 11px/1.2 sans-serif;cursor:pointer}.bib-preview-section-label{border:1px solid #e5e7eb;background:#fff;color:#374151;border-radius:6px;padding:4px 7px;font:500 11px/1.2 sans-serif;text-transform:capitalize}`;
}

function interactiveScript(selectedSectionKey?: string): string {
  return `<script>
(function(){
  var selected = '${escapeScriptText(selectedSectionKey ?? '')}';
  function label(key){ return String(key || '').replace(/_/g, ' '); }
  function post(type, key){ window.parent.postMessage({ source: 'bib-preview', type: type, sectionKey: key }, '*'); }
  function activate(key){
    selected = key;
    document.querySelectorAll('.bib-preview-section').forEach(function(node){
      node.classList.toggle('is-selected', node.getAttribute('data-bib-section') === key);
    });
  }
  document.querySelectorAll('.bib-preview-section').forEach(function(section){
    var key = section.getAttribute('data-bib-section');
    if(!key) return;
    var toolbar = document.createElement('div');
    toolbar.className = 'bib-preview-section-toolbar';
    toolbar.innerHTML = '<span class="bib-preview-section-label">' + label(key) + '</span><button type="button" class="bib-preview-section-button">Editar</button>';
    section.insertBefore(toolbar, section.firstChild);
    toolbar.querySelector('button').addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      activate(key);
      post('edit-section', key);
    });
    section.addEventListener('click', function(event){
      if(event.target && event.target.closest && event.target.closest('.bib-preview-section-toolbar')) return;
      activate(key);
      post('select-section', key);
    });
  });
  if(selected) activate(selected);
})();
</script>`;
}

function detectPreviewResourceWarnings(doc?: Document | null): string[] {
  if (!doc) return [];

  const warnings: string[] = [];
  const brokenImages = Array.from(doc.images).filter(
    (image) => image.complete && image.naturalWidth === 0,
  );
  if (brokenImages.length > 0) {
    warnings.push(`${brokenImages.length} imagem(ns) nao carregaram.`);
  }

  const brokenStyles = Array.from(
    doc.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'),
  ).filter((link) => !link.sheet);
  if (brokenStyles.length > 0) {
    warnings.push(`${brokenStyles.length} arquivo(s) CSS nao carregaram.`);
  }

  let failedFonts = 0;
  doc.fonts?.forEach((font) => {
    if (font.status === 'error') failedFonts += 1;
  });
  if (failedFonts > 0) {
    warnings.push(`${failedFonts} fonte(s) nao carregaram.`);
  }

  return warnings;
}

export function buildPreviewHtml(
  contentHtml: string,
  videoUrl?: string,
  generationMode?: 'ai' | 'template' | 'library',
  options?: { interactiveSections?: boolean; selectedSectionKey?: string },
): string {
  const video = videoUrl?.trim() ?? '';
  const videoBlock = video
    ? `<section style="margin:0;padding:0"><video src="${video}" style="width:100%;height:auto;display:block;" autoplay loop muted controls></video></section>`
    : '';
  const bodyHtml = instrumentSections(
    contentHtml,
    Boolean(options?.interactiveSections),
  );

  const body =
    generationMode === 'template'
      ? `${videoBlock}${bodyHtml}`
      : `${videoBlock}<div style="max-width:1200px;margin:0 auto;padding:20px 20px 40px">${bodyHtml}</div>`;

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}img{max-width:100%;height:auto}${options?.interactiveSections ? interactiveStyles() : ''}</style></head><body>${body}${options?.interactiveSections ? interactiveScript(options.selectedSectionKey) : ''}</body></html>`;
}

interface Props {
  html: string | null;
  videoUrl?: string;
  loading: boolean;
  generationMode?: 'ai' | 'template' | 'library';
  renderMode?: 'fragment' | 'full_document';
  publicBaseUrl?: string;
  interactiveSections?: boolean;
  selectedSectionKey?: string;
  onSectionSelect?: (sectionKey: string) => void;
  onSectionEdit?: (sectionKey: string) => void;
}

export function PreviewPane({
  html,
  videoUrl,
  loading,
  generationMode,
  renderMode = 'fragment',
  publicBaseUrl,
  interactiveSections,
  selectedSectionKey,
  onSectionSelect,
  onSectionEdit,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [resourceWarnings, setResourceWarnings] = useState<string[]>([]);
  const deviceButtons: Array<{ value: PreviewDevice; label: string }> = [
    { value: 'desktop', label: 'Desktop' },
    { value: 'tablet', label: 'Tablet' },
    { value: 'mobile', label: 'Mobile' },
  ];
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const isFullDocumentPreview = renderMode === 'full_document' && Boolean(html);
  const fullDocumentPreview = isFullDocumentPreview
    ? buildFullDocumentPreviewHtml(html ?? '', publicBaseUrl)
    : null;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    setResourceWarnings([]);
    const onLoad = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight;
        if (h) iframe.style.height = `${h + 40}px`;
        if (isFullDocumentPreview) {
          setResourceWarnings(
            detectPreviewResourceWarnings(iframe.contentDocument),
          );
        }
      } catch {
        // sandboxed
      }
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [html, isFullDocumentPreview]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as
        | { source?: string; type?: string; sectionKey?: string }
        | undefined;
      if (data?.source !== 'bib-preview' || !data.sectionKey) return;
      if (data.type === 'edit-section') onSectionEdit?.(data.sectionKey);
      if (data.type === 'select-section') onSectionSelect?.(data.sectionKey);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSectionEdit, onSectionSelect]);

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
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">
          Nenhum conteúdo gerado
        </p>
        <p className="text-xs mt-1">
          Preenche o formulário e clica em Gerar Página
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {fullDocumentPreview && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {deviceButtons.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setDevice(item.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  device === item.value
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {[...fullDocumentPreview.warnings, ...resourceWarnings].map((warning) => (
            <span
              key={warning}
              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-800"
            >
              {warning}
            </span>
          ))}
        </div>
      )}

      <iframe
        ref={iframeRef}
        sandbox={
          fullDocumentPreview
            ? 'allow-same-origin'
            : 'allow-same-origin allow-scripts'
        }
        srcDoc={
          fullDocumentPreview
            ? fullDocumentPreview.html
            : buildPreviewHtml(html, videoUrl, generationMode, {
                interactiveSections,
                selectedSectionKey,
              })
        }
        className="mx-auto w-full bg-white rounded-xl border border-gray-200 shadow-sm"
        style={{
          minHeight: 600,
          width: fullDocumentPreview ? previewDeviceWidth(device) : '100%',
          maxWidth: '100%',
        }}
        title="Preview da página"
      />
    </div>
  );
}
