/**
 * Wraps AI-generated content HTML in the fixed visual shell
 * (video header + inline styles + WhatsApp CTA)
 */
export function assemblePageHtml(contentHtml: string, videoUrl?: string | null): string {
  const waLink = process.env.WP_WHATSAPP_LINK ?? '';
  const video = videoUrl?.trim() ?? '';

  return `<section style="margin: 0; padding: 0;"><article style="max-width: 900px; margin: 0 auto; padding: 0 20px;"><video src="${video}" style="width: 100%; max-width: 900px; height: auto; display: block; margin: 0 auto;" autoplay="autoplay" loop="loop" muted="" controls="controls" width="300" height="150"></video></article></section>
<div style="max-width: 900px; margin: 0 auto; padding: 0 20px; text-align: left; color: #320000;">
${contentHtml}
\t<p style="margin-top: 32px;"><strong>Pedido imediato via WhatsApp:</strong>
\t\t<a style="color: #111 !important; font-weight: 600; text-decoration: underline;"
\t\t\thref="${waLink}" target="_blank" rel="noopener noreferrer">${waLink}</a>
\t</p>
</div>`;
}
