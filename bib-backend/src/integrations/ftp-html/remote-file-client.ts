export interface ConnectionResult {
  ok: boolean;
  code?: 'auth' | 'dns' | 'timeout' | 'not_found' | 'unknown';
  message?: string;
}

export interface RemoteFileStat {
  path: string;
  size: number;
  modifiedAt: Date | null;
}

export interface RemoteFileAttempt {
  path: string;
  directory: string;
}

export interface RemoteFileClient {
  testConnection(): Promise<ConnectionResult>;
  resolveAttempt(path: string): RemoteFileAttempt;
  stat(path: string): Promise<RemoteFileStat | null>;
  statAccountPath(path: string): Promise<RemoteFileStat | null>;
  download(path: string): Promise<Buffer>;
  ensureDirectory(path: string): Promise<void>;
  upload(path: string, data: Buffer): Promise<void>;
  uploadAccountPath(path: string, data: Buffer): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}
