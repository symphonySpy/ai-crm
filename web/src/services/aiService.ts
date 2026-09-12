import type { AiSuggestion } from '@/lib/types';
import { post } from './http';
import { leadSuggestionsPath, suggestionRejectPath } from './apiPath';

/** A20: only ever called because a person pressed the button. Nothing generates on its own. */
export const generate = (leadId: string) =>
  post<{ suggestion: AiSuggestion }>(leadSuggestionsPath(leadId));

export const reject = (suggestionId: string) =>
  post<{ suggestion: AiSuggestion }>(suggestionRejectPath(suggestionId));
