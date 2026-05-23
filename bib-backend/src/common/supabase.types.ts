export interface DbError {
  code?: string;
  message: string;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

export interface DbCountResult<T> extends DbResult<T> {
  count?: number | null;
}
