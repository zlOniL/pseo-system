import { slotDocument, validateSlotValues, sourceHash } from './hybrid-slots';

describe('Hybrid locked structure', () => {
  it('edits text and verified anchor destinations without touching media, CSS or tags', () => {
    const original =
      '<section class="fixed"><h2>Lisboa</h2><p>Alfama <strong>antiga</strong></p><a href="https://lisboa.pt/">Câmara de Lisboa</a><img src="https://cdn.pt/lisboa.jpg" alt="Lisboa">{{IMAGE_7}}</section>';
    const doc = slotDocument(original, 'html');
    const values = Object.fromEntries(
      doc.slots.map((s) => [
        s.id,
        s.kind === 'link' ? 'https://cm-faro.pt/' : 'Faro & arredores',
      ]),
    );
    validateSlotValues(doc.slots, values);
    const rendered = doc.render(values) as string;
    expect(rendered).toContain('class="fixed"');
    expect(rendered).toContain('<strong>Faro &amp; arredores</strong>');
    expect(rendered).toContain('href="https://cm-faro.pt/"');
    expect(rendered).toContain('src="https://cdn.pt/lisboa.jpg"');
    expect(rendered).toContain('{{IMAGE_7}}');
    expect(rendered).not.toContain('Alfama');
  });

  it('preserves JSON schema, types and media while replacing nested HTML', () => {
    const original = [
      {
        type: 'paragraph',
        text: '<p>Lisboa</p>',
        image_url: 'https://cdn.pt/lisboa.jpg',
        enabled: true,
      },
    ];
    const doc = slotDocument(original, 'whitelabel_json');
    expect(doc.slots).toEqual([{ id: 's0', kind: 'text', value: 'Lisboa' }]);
    expect(doc.render({ s0: 'Porto' })).toEqual([
      { ...original[0], text: '<p>Porto</p>' },
    ]);
  });

  it('rejects missing slots and markup injection', () => {
    const doc = slotDocument('<p>Lisboa</p>', 'html');
    expect(() => validateSlotValues(doc.slots, {})).toThrow('campos');
    expect(() =>
      validateSlotValues(doc.slots, { s0: '<script>alert(1)</script>' }),
    ).toThrow('HTML');
  });

  it('invalidates preparation when the source changes', () => {
    expect(sourceHash('<p>old</p>')).not.toBe(sourceHash('<p>new</p>'));
  });
});
