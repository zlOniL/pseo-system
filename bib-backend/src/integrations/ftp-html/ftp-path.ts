import { BadRequestException } from '@nestjs/common';
import * as path from 'path/posix';

export function normalizeFtpRoot(root: string): string {
  const trimmed = root.trim();
  if (trimmed === '.' || trimmed === '/') return '.';
  const cleaned = cleanParts(root);
  if (!cleaned) throw new BadRequestException('Raiz FTP invalida.');
  return cleaned;
}

export function normalizeRemotePath(input: string): string {
  const cleaned = cleanParts(input);
  if (!cleaned) throw new BadRequestException('Caminho FTP invalido.');
  return cleaned;
}

export function resolveFtpPath(root: string, input: string): string {
  const cleanRoot = normalizeFtpRoot(root);
  const cleanInput = normalizeRemotePath(input);
  return cleanRoot === '.' ? cleanInput : path.join(cleanRoot, cleanInput);
}

export function remoteDirname(remotePath: string): string {
  return path.dirname(remotePath);
}

function cleanParts(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => part === '.' || part === '..' || part.includes('\0'))
  ) {
    return '';
  }
  return parts.join('/');
}
