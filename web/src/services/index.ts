/**
 * Barrel for the service layer, so a screen imports one namespace per domain:
 *
 *   import { leadService, aiService } from '@/services';
 *   const { rows } = await leadService.list({ page: 1 });
 *
 * Mirrors how the API itself is split — routes stay thin, services hold the work — so
 * the same domain word means the same thing on both sides of the wire.
 */
export * as authService from './authService';
export * as leadService from './leadService';
export * as messageService from './messageService';
export * as aiService from './aiService';
export * as directoryService from './directoryService';

export { ApiError } from './http';
export * from './apiPath';
export type { LeadDetail, LeadListParams } from './leadService';
