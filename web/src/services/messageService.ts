import type { Message } from '@/lib/types';
import { post } from './http';
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
