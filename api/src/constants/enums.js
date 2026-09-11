// A18: the five pipeline stages are fixed. Order matters for reporting and for the board.
const LEAD_STAGES = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];

const LEAD_SOURCES = ['website', 'manual', 'line'];

const USER_ROLES = ['sales', 'manager'];

const ACTIVITY_TYPES = [
  'lead_created',
  'stage_changed',
  'owner_changed',
  'note_added',
  'message_received',
  'message_sent',
  'ai_suggestion_requested',
  'ai_suggestion_approved',
  'ai_suggestion_rejected',
  'contact_updated',
];

const MESSAGE_DIRECTIONS = ['inbound', 'outbound'];

const MESSAGE_CONTENT_TYPES = [
  'text',
  'sticker',
  'image',
  'video',
  'audio',
  'file',
  'location',
  'other',
];

// A34/A35: inbound messages land as 'received'. Outbound walks pending -> sent | failed.
const MESSAGE_SEND_STATUSES = ['received', 'pending', 'sent', 'failed'];

// A22: every AI output starts as 'proposed' and needs a human decision.
const AI_SUGGESTION_STATUSES = ['proposed', 'approved', 'rejected'];

const AI_SUGGESTION_KINDS = ['copilot_bundle'];

const WEBHOOK_PROCESS_STATUSES = ['received', 'processed', 'ignored', 'failed'];

module.exports = {
  LEAD_STAGES,
  LEAD_SOURCES,
  USER_ROLES,
  ACTIVITY_TYPES,
  MESSAGE_DIRECTIONS,
  MESSAGE_CONTENT_TYPES,
  MESSAGE_SEND_STATUSES,
  AI_SUGGESTION_STATUSES,
  AI_SUGGESTION_KINDS,
  WEBHOOK_PROCESS_STATUSES,
};
