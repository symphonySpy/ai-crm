import type { Message } from '@/lib/types';
import { get, post, withQuery } from './http';
import { leadMessagesPath } from './apiPath';

/**
 * Sending is an approval, not a draft. The API refuses an outbound message without an
 * approver, and the database refuses it again through chk_messages_outbound_requires_approver.
 */
export const send = (leadId: string, text: string, suggestionId?: string) =>
  post<{ message: Message }>(leadMessagesPath(leadId), {
    text,
    suggestion_id: suggestionId ?? null,
  });

/**
 * Messages older than `before` (a message id the screen already has), oldest-to-newest.
 * A cursor rather than a page number, so messages arriving while someone scrolls back do
 * not shift the pages under them.
 */
export const older = (leadId: string, before: string) =>
  get<{ rows: Message[]; hasOlder: boolean }>(withQuery(leadMessagesPath(leadId), { before }));
