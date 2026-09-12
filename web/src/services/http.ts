/**
 * The one place an HTTP call is made.
 *
 * tmk-admin has services/axios.js doing this job with an axios instance and
 * interceptors. The shape is the same — one client, configured once, used by every
 * service — but built on fetch instead, for two reasons:
 *
 *   1. Next.js extends the global fetch with its own caching (`next: { revalidate,
 *      tags }`). An axios call is invisible to that, so choosing axios here would opt
 *      the app out of a framework feature to gain nothing this app needs.
 *
 *   2. tmk-admin's interceptors exist to attach a bearer token from localStorage and to
 *      refresh it on 401. This app has no token to attach: the session is an httpOnly
 *      cookie the browser sends on its own, and JavaScript cannot read it — which is
 *      the point, because a token in localStorage is a token any XSS can walk off with.
 */
import type { Envelope } from './types';

export class ApiError extends Error {
  code: number;
  requestId?: string;
  fieldErrors?: { field?: string; message?: string }[];

  constructor(envelope: Envelope<unknown>) {
    super(envelope.message);
    this.name = 'ApiError';
    this.code = envelope.code;
    this.requestId = envelope.requestId;
    this.fieldErrors = envelope.errors ?? undefined;
  }

  /**
   * 401 means we do not know who you are and signing in fixes it. 403 means we do and
   * the answer is no. Routing 403 to the login screen traps the user in a loop where
   * signing in succeeds and the action still fails — so the distinction lives here,
   * once, rather than being re-derived by each screen.
   */
  get needsLogin() {
    return this.code === 401;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    // Same-origin because next.config.mjs proxies /api — the session cookie is
    // first-party and travels without any CORS relaxation.
    credentials: 'same-origin',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });

  if (res.status === 204) return undefined as T;

  const envelope = (await res.json().catch(() => ({
    success: false,
    code: res.status,
    message: 'ระบบตอบกลับในรูปแบบที่อ่านไม่ได้',
    data: null,
  }))) as Envelope<T>;

  if (!envelope.success) throw new ApiError(envelope);
  return envelope.data as T;
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

/** Drops empty values so the URL carries only filters that are actually set. */
export function withQuery(path: string, params: QueryParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export const get = <T>(path: string) => request<T>(path);

export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
