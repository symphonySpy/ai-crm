'use strict';

// Which field changes are worth keeping history for.
//
// The rule is not "log everything" — an unfiltered change log grows without bound,
// slows every write, and turns into an unmanaged copy of personal data that has to be
// scrubbed when a customer exercises their right to erasure. It is also not "log
// nothing", because a CRM genuinely has to answer "what was this company called when
// we closed that deal?".
//
// So each entry here has to justify itself: someone will ask what this value used to
// be, and the answer has to survive the master record being edited.
//
// Deliberately NOT tracked:
//   - contacts.phone / contacts.email — personal data with no business question
//     attached to their history. Keeping old phone numbers forever is a liability.
//   - leads.stage — already recorded in `activities` with richer context. Logging it
//     here too would produce two sources of truth for the same event.
//   - anything on messages, ai_suggestions, line_webhook_events — those tables are
//     append-only, so the row *is* the history.

const TRACKED_FIELDS = {
  companies: [
    // The case that started this: a company renames, and every past deal has to stay
    // readable as the name it was signed under.
    'name',
    'industry',
    'is_active',
  ],
  contacts: [
    // A contact moving employer is a real event. Without this, a deal closed while
    // they worked at company A silently looks like it belonged to company B.
    'company_id',
    'name',
    'is_active',
  ],
  leads: [
    // Who owned the deal, what it was worth, and what it was for — the three fields a
    // commission or forecasting dispute turns on.
    'owner_id',
    'value_thb',
    'title',
  ],
};

module.exports = { TRACKED_FIELDS };
