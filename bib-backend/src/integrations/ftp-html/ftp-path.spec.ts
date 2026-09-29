import { BadRequestException } from '@nestjs/common';
import { normalizeFtpRoot, normalizeRemotePath, resolveFtpPath } from './ftp-path';

describe('ftp path helpers', () => {
  it('normalizes roots and joins relative paths inside the root', () => {
    expect(normalizeFtpRoot('/public_html/')).toBe('public_html');
    expect(resolveFtpPath('public_html', 'reparacao-de-estores.html')).toBe(
      'public_html/reparacao-de-estores.html',
    );
    expect(resolveFtpPath('public_html', ' cidades/lisboa.html ')).toBe(
      'public_html/cidades/lisboa.html',
    );
    expect(normalizeRemotePath('/reparacao-de-estores.html')).toBe(
      'reparacao-de-estores.html',
    );
  });

  it.each(['../secret.html', 'nested/../secret.html', '.', ''])(
    'rejects unsafe path %s',
    (path) => {
      expect(() => resolveFtpPath('public_html', path)).toThrow(
        BadRequestException,
      );
    },
  );
});
