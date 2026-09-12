/**
 * The API answers in one envelope for every endpoint, success or failure, so the
 * "did this work?" check is written once — in http.ts — instead of at every call site.
 */
export interface Envelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
  errors?: { field?: string; message?: string; constraint?: string }[] | null;
  requestId?: string;
}
