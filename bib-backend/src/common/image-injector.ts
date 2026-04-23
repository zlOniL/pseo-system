export function injectImages(
  html: string,
  images: string[],
  keyword: string,
  service: string,
  city: string,
): string {
  const alts = [
    keyword,
    `${service} profissional em ${city}`,
    `serviços de ${service} em ${city}`,
    `como funciona ${service} em ${city}`,
    `tipos de ${service} em ${city}`,
    `prevenção de avarias ${service} em ${city}`,
    `${service} perto de mim em ${city}`,
    `${service} urgente 24h em ${city}`,
  ];

  for (let i = 0; i < 8; i++) {
    const placeholder = `{{IMAGE_${i + 1}}}`;
    const src = images[i]?.trim();
    if (src) {
      const alt = alts[i] ?? keyword;
      const imgHtml =
        `\n<hr />\n` +
        `<img class="alignnone size-full" style="max-width: 100%; height: auto; display: block;" ` +
        `src="${src}" alt="${alt}" width="1080" height="720" />\n` +
        `<hr />\n`;
      html = html.replace(placeholder, imgHtml);
    } else {
      html = html.replace(placeholder, '');
    }
  }

  return html;
}
