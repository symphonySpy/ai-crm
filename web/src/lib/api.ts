import type {
  Activity, AiSuggestion, Lead, Message, Pagination, StageSummary, User,
} from './types';

/**
 * The API answers in one envelope for every endpoint, success or failure, so the
 * "did this work?" check is written once — here — instead of at every call site.
 */
interface Envelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
  errors?: { field?: string; message?: string; constraint?: string }[] | null;
  requestId?: string;
}

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/api/auth/me'),

  leads: (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') query.set(k, String(v));
    });
    return request<{ rows: Lead[]; pagination: Pagination }>(`/api/leads?${query}`);
  },

  summary: () =>
    request<{ stages: StageSummary[]; needsTriage: number }>('/api/leads/summary'),

  lead: (id: string) =>
    request<{
      lead: Lead;
      activities: Activity[];
      messages: Message[];
      aiSuggestions: AiSuggestion[];
    }>(`/api/leads/${id}`),

  changeStage: (id: string, stage: string, note?: string) =>
    request<{ lead: Lead }>(`/api/leads/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, note }),
    }),

  assignOwner: (id: string, ownerId: string | null) =>
    request<{ lead: Lead }>(`/api/leads/${id}/owner`, {
      method: 'PATCH',
      body: JSON.stringify({ owner_id: ownerId }),
    }),

  addNote: (id: string, note: string) =>
    request<{ activity: Activity }>(`/api/leads/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  users: () => request<{ rows: User[] }>('/api/users'),

  generateSuggestion: (leadId: string) =>
    request<{ suggestion: AiSuggestion }>(`/api/leads/${leadId}/ai-suggestions`, {
      method: 'POST',
    }),

  sendMessage: (leadId: string, text: string, suggestionId?: string) =>
    request<{ message: Message }>(`/api/leads/${leadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, suggestion_id: suggestionId ?? null }),
    }),

  rejectSuggestion: (id: string) =>
    request<{ suggestion: AiSuggestion }>(`/api/ai-suggestions/${id}/reject`, {
      method: 'POST',
    }),
};

export const formatTHB = (value: number) =>
  new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(value);

/** A10: stored in UTC, read in Bangkok. */
export const formatDateTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('th-TH', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(iso))
    : '—';

export const formatDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(
        new Date(iso),
      )
    : '—';
