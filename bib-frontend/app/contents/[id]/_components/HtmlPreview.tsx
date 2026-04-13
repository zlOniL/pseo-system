"use client";

import { useEffect, useRef } from "react";

function buildPreviewHtml(contentHtml: string, videoUrl?: string, generationMode?: 'ai' | 'template'): string {
  const video = videoUrl?.trim() ?? "";
  const videoBlock = video
    ? `<section style="margin:0;padding:0"><article style="max-width:900px;margin:0 auto;padding:0 20px"><video src="${video}" style="width:100%;max-width:900px;height:auto;display:block;margin:0 auto" autoplay loop muted controls width="300" height="150"></video></article></section>`
    : "";

  const body = generationMode === 'template'
    ? `${videoBlock}${contentHtml}`
    : `${videoBlock}<div style="max-width:900px;margin:0 auto;padding:20px 20px 40px">${contentHtml}</div>`;

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`;
}

export function HtmlPreview({ html, videoUrl, generationMode }: { html: string; videoUrl?: string; generationMode?: 'ai' | 'template' }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight;
        if (h) iframe.style.height = `${h + 40}px`;
      } catch {
        // cross-origin guard
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin allow-scripts"
      srcDoc={buildPreviewHtml(html, videoUrl, generationMode)}
      className="w-full bg-white rounded-xl border border-gray-200 shadow-sm"
      style={{ minHeight: 500 }}
      title="Preview da página"
    />
  );
}
