import type { Activity, AiSuggestion, Lead, Message, Pagination, StageSummary } from '@/lib/types';
import { get, patch, post, withQuery } from './http';
import {
  LEAD_LIST_PATH,
  LEAD_SUMMARY_PATH,
  leadDetailPath,
  leadNotesPath,
  leadOwnerPath,
  leadStagePath,
} from './apiPath';

export interface LeadListParams {
  // Index signature so these can be handed straight to withQuery; an interface without
  // one is not assignable to Record<string, …> even when every member fits.
  [key: string]: string | number | boolean | undefined;
  q?: string;
  stage?: string;
  source?: string;
  ownerId?: string;
  needsTriage?: string;
  page?: number;
  limit?: number;
}

export interface LeadDetail {
  lead: Lead;
  activities: Activity[];
  messages: Message[];
  aiSuggestions: AiSuggestion[];
}

export const list = (params: LeadListParams) =>
  get<{ rows: Lead[]; pagination: Pagination }>(withQuery(LEAD_LIST_PATH, params));

export const summary = () =>
  get<{ stages: StageSummary[]; needsTriage: number }>(LEAD_SUMMARY_PATH);

export const detail = (id: string) => get<LeadDetail>(leadDetailPath(id));

export const changeStage = (id: string, stage: string, note?: string) =>
  patch<{ lead: Lead }>(leadStagePath(id), { stage, note });

export const assignOwner = (id: string, ownerId: string | null) =>
  patch<{ lead: Lead }>(leadOwnerPath(id), { owner_id: ownerId });

export const addNote = (id: string, note: string) =>
  post<{ activity: Activity }>(leadNotesPath(id), { note });
