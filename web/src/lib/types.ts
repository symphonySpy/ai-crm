export type Stage = 'New' | 'Qualified' | 'Proposal' | 'Won' | 'Lost';
export type Source = 'website' | 'manual' | 'line';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'sales' | 'manager';
}

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  line_user_id: string | null;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
}

export interface Lead {
  id: string;
  title: string;
  stage: Stage;
  value_thb: number;
  source: Source;
  needs_triage: boolean;
  last_contact_at: string | null;
  createdAt: string;
  owner: User | null;
  contact: Contact | null;
  company: Company | null;
}

export interface Activity {
  id: string;
  type: string;
  from_stage: Stage | null;
  to_stage: Stage | null;
  note: string | null;
  occurred_at: string;
  actor: { id: string; name: string; role: string } | null;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  content_type: string;
  body: string | null;
  send_status: 'received' | 'pending' | 'sent' | 'failed';
  error_detail: string | null;
  attempt_count: number;
  createdAt: string;
}

export interface ScoreReason {
  criterion: string;
  points: number;
  note: string;
}

export interface SuggestionPayload {
  summary: string;
  score: number;
  score_reasons: ScoreReason[];
  next_best_action: string;
  draft_line_reply: string | null;
}

export interface AiSuggestion {
  id: string;
  payload: SuggestionPayload;
  model: string | null;
  degraded: boolean;
  status: 'proposed' | 'approved' | 'rejected';
  decided_at: string | null;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface StageSummary {
  stage: Stage;
  count: number;
  value_thb: number;
}
