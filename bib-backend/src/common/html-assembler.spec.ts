import { assemblePageHtml, assembleTemplateHtml } from './html-assembler';

describe('html assembler', () => {
  const originalWhatsapp = process.env.WP_WHATSAPP_LINK;

  afterEach(() => {
    process.env.WP_WHATSAPP_LINK = originalWhatsapp;
  });

  it('wraps AI HTML with the current WordPress shell and WhatsApp CTA', () => {
    process.env.WP_WHATSAPP_LINK = 'https://wa.me/351900000000';

    const html = assemblePageHtml('<h1>Reparacao de Estores</h1>', 'hero.mp4');

    expect(html).toContain('<video src="hero.mp4"');
    expect(html).toContain(
      '<div style="max-width: 1200px; margin: 0 auto; text-align: left; color: #320000;">',
    );
    expect(html).toContain('<h1>Reparacao de Estores</h1>');
    expect(html).toContain('Pedido imediato via WhatsApp');
    expect(html).toContain('https://wa.me/351900000000');
  });

  it('keeps template HTML intact apart from the video prefix and outer container', () => {
    const template = '<section><h2>Conteudo template</h2></section>';

    const html = assembleTemplateHtml(template, 'template.mp4');

    expect(html).toContain('<video src="template.mp4"');
    expect(html).toContain(template);
    expect(html).not.toContain('Pedido imediato via WhatsApp');
  });
});
