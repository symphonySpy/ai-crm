'use strict';

// Tables whose updates are recorded in tbl_audit_history.
//
// activities is absent on purpose: it is append-only, so the row is already the
// history and auditing it would only record the system writing history about history.
const AUDITED_TABLES = [
  'users',
  'companies',
  'contacts',
  'leads',
  'messages',
  'ai_suggestions',
  'line_webhook_events',
];

// Columns never copied into an audit entry, whatever else changes on the row.
//
// Everything else on an audited table is recorded, so the default is "log it" and each
// exclusion below has to earn its place:
//
//   password_hash        a credential. It must not exist in a second table, and its
//                        history is of no use to anyone who is not attacking the system.
//   raw_payload          the whole LINE webhook body. line_webhook_events already keeps
//                        it immutably; copying it on every status change would multiply
//                        the largest column in the schema for no gain.
//   payload,
//   context_snapshot     the AI bundle and the model's input. Same reasoning — already
//                        immutable where they live.
//   created_at,
//   updated_at,
//   created_by,
//   updated_by           bookkeeping. updated_at and updated_by change on literally
//                        every write, so logging them would add a meaningless line to
//                        every entry — and the audit row already records changed_by,
//                        which is the same fact stated once.
//
// The *_data_json and *_master_json snapshot columns are excluded dynamically (see
// isAuditable): they are themselves point-in-time copies, and auditing a snapshot
// produces a snapshot of a snapshot.
const AUDIT_DENY_FIELDS = new Set([
  'password_hash',
  'raw_payload',
  'payload',
  'context_snapshot',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
]);

const isAuditable = (field) =>
  !AUDIT_DENY_FIELDS.has(field) &&
  !field.endsWith('_data_json') &&
  !field.endsWith('_master_json') &&
  !field.endsWith('_snapshot_json');

// Turning is_active off is a soft delete; it is recorded as its own action so an audit
// screen can show deletions separately from ordinary edits.
const AUDIT_ACTIONS = ['update', 'soft_delete', 'restore'];

module.exports = { AUDITED_TABLES, AUDIT_DENY_FIELDS, isAuditable, AUDIT_ACTIONS };
