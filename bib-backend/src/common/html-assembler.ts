/**
 * Prepends the video block to a template page.
 * The template HTML is kept completely intact — no wrapper div, no extra styles.
 * Only the video section is added at the top when a videoUrl is provided.
 */
export function assembleTemplateHtml(templateHtml: string, videoUrl?: string | null): string {
  const video = videoUrl?.trim() ?? '';
  if (!video) return templateHtml;

  const videoSection = `<section style="margin: 0; padding: 0;"><article style="max-width: 1200px; margin: 0 auto;"><video src="${video}" style="width: 100%; height: auto; display: block;" autoplay="autoplay" loop="loop" muted="" controls="controls"></video></article></section>\n`;
  return videoSection + templateHtml;
}

/**
 * Wraps AI-generated content HTML in the fixed visual shell
 * (video header + inline styles + WhatsApp CTA)
 */
export function assemblePageHtml(contentHtml: string, videoUrl?: string | null): string {
  const waLink = process.env.WP_WHATSAPP_LINK ?? '';
  const video = videoUrl?.trim() ?? '';

  const videoSection = video
    ? `<section style="margin: 0; padding: 0;"><article style="max-width: 1200px; margin: 0 auto;"><video src="${video}" style="width: 100%; height: auto; display: block;" autoplay="autoplay" loop="loop" muted="" controls="controls"></video></article></section>\n`
    : '';

  return `${videoSection}<div style="max-width: 1200px; margin: 0 auto; text-align: left; color: #320000;">
${contentHtml}
\t<p style="margin-top: 32px;"><strong>Pedido imediato via WhatsApp:</strong>
\t\t<a style="color: #111 !important; font-weight: 600; text-decoration: underline;"
\t\t\thref="${waLink}" target="_blank" rel="noopener noreferrer">${waLink}</a>
\t</p>
</div>`;
}
