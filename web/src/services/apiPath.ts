/**
 * Every endpoint this app calls, in one place.
 *
 * Borrowed from the tmk-admin layout. The value is not tidiness: when the API renames a
 * route, the change is one line here instead of a grep across pages, and a path typed
 * inline in a component is a path nobody finds until it 404s in front of a user.
 *
 * Paths are relative because next.config.mjs proxies /api to the Express service — see
 * the comment there for why the browser never talks to the API directly.
 */

// --- auth ---------------------------------------------------------------------
export const AUTH_LOGIN_PATH = '/api/auth/login';
export const AUTH_LOGOUT_PATH = '/api/auth/logout';
export const AUTH_ME_PATH = '/api/auth/me';

// --- leads --------------------------------------------------------------------
export const LEAD_LIST_PATH = '/api/leads';
export const LEAD_SUMMARY_PATH = '/api/leads/summary';
export const leadDetailPath = (id: string) => `/api/leads/${id}`;
export const leadStagePath = (id: string) => `/api/leads/${id}/stage`;
export const leadOwnerPath = (id: string) => `/api/leads/${id}/owner`;
export const leadNotesPath = (id: string) => `/api/leads/${id}/notes`;

// --- messages -----------------------------------------------------------------
export const leadMessagesPath = (leadId: string) => `/api/leads/${leadId}/messages`;

// --- AI copilot ---------------------------------------------------------------
export const leadSuggestionsPath = (leadId: string) => `/api/leads/${leadId}/ai-suggestions`;
export const suggestionRejectPath = (id: string) => `/api/ai-suggestions/${id}/reject`;

// --- directory ----------------------------------------------------------------
export const USER_LIST_PATH = '/api/users';
